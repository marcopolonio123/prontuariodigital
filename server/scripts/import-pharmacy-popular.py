"""Match official PFPB barcodes to CMED presentations and the active Anvisa product catalog."""
import argparse
from collections import defaultdict
from datetime import date
import gzip
import hashlib
import json
from pathlib import Path
import re
import subprocess

from openpyxl import load_workbook

SERVER = Path(__file__).resolve().parent.parent
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('pfpb_pdf', type=Path)
p.add_argument('pfpb_edition', type=date.fromisoformat)
p.add_argument('cmed_xlsx', type=Path)
p.add_argument('cmed_edition', type=date.fromisoformat)
p.add_argument('--out', type=Path, default=SERVER / 'data' / 'pharmacy-popular.json.gz')
args = p.parse_args()

def digits(value):
    return str(value).strip()

def ean_valid(ean):
    if not re.fullmatch(r'\d{13}', ean):
        return False
    checksum = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(ean[:-1])))
    return (10 - checksum % 10) % 10 == int(ean[-1])

def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

def plain(value):
    return ' '.join(str(value or '').split())

# pdftotext layout output preserves the product column and the last (EAN) column.
# The indication column may be merged across rows and is deliberately not imported.
pdf_text = subprocess.check_output(['pdftotext', '-layout', args.pfpb_pdf, '-'], text=True)
source_date = args.pfpb_edition.strftime('%d/%m/%Y')
if not re.search(r'Atualizada em\s+' + re.escape(source_date), pdf_text, re.I):
    p.error('PFPB edition does not match the date printed in the PDF')
official = {}
excluded = set()
for line in pdf_text.splitlines():
    cols = re.split(r'\s{2,}', line.strip())
    ean = cols[-1]
    if len(cols) < 2 or not re.fullmatch(r'\d{13}', ean):
        continue
    if not ean_valid(ean):
        excluded.add(ean)
        continue
    product = plain(cols[0])
    if len(product) < 4 or len(product) > 200 or ean in official and official[ean] != product:
        p.error('Invalid or conflicting PFPB product for EAN ' + ean)
    official[ean] = product
if len(official) < 300:
    p.error('The PFPB extraction appears incomplete')

workbook = load_workbook(args.cmed_xlsx, read_only=True, data_only=True)
if not any(args.cmed_edition.strftime('%d/%m/%Y') in str(row[0]) for row in workbook['Cabeçalho'].iter_rows(max_row=6, values_only=True)):
    p.error('CMED edition does not match the date printed in the workbook')
sheet = workbook['Lista PMC'].iter_rows(max_col=10, values_only=True)
header = next(sheet)
expected = ['REGISTRO', 'EAN 1', 'EAN 2', 'EAN 3', 'PRODUTO', 'APRESENTAÇÃO']
if list(header[4:10]) != expected:
    p.error('Unexpected CMED columns')
cmed = defaultdict(set)
for row in sheet:
    registration = digits(row[4])
    if not re.fullmatch(r'\d{13}', registration):
        continue
    product, presentation = map(plain, row[8:10])
    if not product or not presentation or len(product) > 150 or len(presentation) > 240:
        continue
    for raw in row[5:8]:
        ean = digits(raw)
        if ean in official:
            cmed[ean].add((registration, product, presentation))
workbook.close()

anvisa_path = SERVER / 'data' / 'anvisa-medications.json.gz'
anvisa = json.loads(gzip.decompress(anvisa_path.read_bytes()))
active = {registration for registration, *_ in anvisa['items']}
rows = []
for ean, official_product in sorted(official.items()):
    matches = cmed[ean]
    # Do not pick a brand or registration from an ambiguous match.
    if len(matches) != 1:
        rows.append([ean, official_product, None, None, None])
        continue
    registration, product, presentation = next(iter(matches))
    root = registration[:9]
    rows.append([ean, official_product, root if root in active else None, product, presentation])

joined = sum(row[2] is not None for row in rows)
if joined < 100:
    p.error('The CMED/Anvisa crosswalk appears incomplete')
result = {
    'edition': args.pfpb_edition.isoformat(),
    'cmedEdition': args.cmed_edition.isoformat(),
    'anvisaEdition': anvisa['importedOn'],
    'pfpbSha256': sha(args.pfpb_pdf),
    'cmedSha256': sha(args.cmed_xlsx),
    'excludedInvalidEans': sorted(excluded),
    'items': rows,
}
args.out.parent.mkdir(parents=True, exist_ok=True)
temp = args.out.with_suffix('.tmp')
temp.write_bytes(gzip.compress(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
temp.replace(args.out)
print(f'{len(rows)} official EANs; {joined} linked to the active Anvisa catalog; {len(excluded)} invalid EAN(s) excluded')
