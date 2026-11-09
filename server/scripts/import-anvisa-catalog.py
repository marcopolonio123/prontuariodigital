"""Build the agenda reference from Anvisa's DADOS_ABERTOS_MEDICAMENTOS.csv."""
import argparse
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re

p = argparse.ArgumentParser()
p.add_argument("csv", type=Path)
p.add_argument("import_date", help="Date of the import (YYYY-MM-DD)")
p.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "data/anvisa-medications.json.gz")
args = p.parse_args()
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.import_date):
    p.error("Invalid date")
records = {}
conflicts = set()
with args.csv.open(encoding="latin1", newline="") as f:
    rows = csv.DictReader(f, delimiter=";")
    required = {"TIPO_PRODUTO", "SITUACAO_REGISTRO", "NUMERO_REGISTRO_PRODUTO", "NOME_PRODUTO", "PRINCIPIO_ATIVO"}
    if not required.issubset(rows.fieldnames or []):
        p.error("Unexpected Anvisa file columns")
    for row in rows:
        if row["TIPO_PRODUTO"] != "MEDICAMENTO" or row["SITUACAO_REGISTRO"] != "Ativo":
            continue
        registration = row["NUMERO_REGISTRO_PRODUTO"].strip()
        name = " ".join(row["NOME_PRODUTO"].split())
        ingredient = " ".join(row["PRINCIPIO_ATIVO"].split())
        if not re.fullmatch(r"\d{9}", registration) or not name or len(name) > 150:
            continue
        prior = records.get(registration)
        if prior and prior[0] != name:
            conflicts.add(registration)
        elif not prior or not prior[1] and ingredient:
            records[registration] = (name, ingredient[:300])
data = {"importedOn": args.import_date, "sourceSha256": hashlib.file_digest(args.csv.open("rb"), "sha256").hexdigest(),
        "items": [[key, *value] for key, value in sorted(records.items()) if key not in conflicts]}
if len(data["items"]) < 1000:
    p.error("The file appears incomplete")
args.out.parent.mkdir(parents=True, exist_ok=True)
temp = args.out.with_suffix(".tmp")
temp.write_bytes(gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))
temp.replace(args.out)
print(f"{len(data['items'])} product registrations")
