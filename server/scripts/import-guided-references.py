"""Build local, minimal public reference indexes from the ANS CSVs and IBGE municipality page."""
import csv, gzip, html, json, re, sys
from pathlib import Path

operators_path, plans_path, municipalities_path, edition = sys.argv[1:]
out = Path(__file__).resolve().parents[1] / "data"
def rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f, delimiter=";")
def write(name, data):
    path = out / (name + ".json.gz")
    path.write_bytes(gzip.compress(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode(),mtime=0))
    print(name, path.stat().st_size)
operators = {}
for row in rows(operators_path):
    code = row["REGISTRO_OPERADORA"]
    name = (row["NOME_FANTASIA"] or row["RAZAO_SOCIAL"]).strip()
    if re.fullmatch(r"[0-9]{6}",code) and name:
        operators[code] = [name[:180], row["RAZAO_SOCIAL"].strip()[:180],row["UF"]]
plans = {}
for row in rows(plans_path):
    operator, code = row["REGISTRO_OPERADORA"],row["CD_PLANO"]
    name = row["NM_PLANO"].strip()
    if operator in operators and re.fullmatch(r"[0-9]{9}",code) and row["SITUACAO_PLANO"]=="Ativo" and name:
        plans.setdefault(operator,{})[code] = name[:180]
cities = {}
for name, code in re.findall(r'>([^<>]+)</a></td><td class="numero">(\d{7})</td>',Path(municipalities_path).read_text(encoding="utf-8")):
    cities[code] = html.unescape(name).strip()
assert len(operators)>500 and sum(map(len,plans.values()))>10000 and len(cities)>5500
write("ans-directory", {"edition":edition,"operators":operators,"plans":plans})
write("ibge-cities",cities)
