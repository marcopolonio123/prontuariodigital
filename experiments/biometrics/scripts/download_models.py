"""Download only the exact upstream models and licenses selected for this experiment."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'models/manifest.json').read_text())
for item in manifest['files']:
    destination = ROOT / 'models' / Path(item['path']).name
    if not destination.exists() or hashlib.sha256(destination.read_bytes()).hexdigest() != item['sha256']:
        url = f"https://media.githubusercontent.com/media/{manifest['repository']}/{manifest['revision']}/{item['path']}"
        with urlopen(url, timeout=120) as response:
            content = response.read(item['bytes'] + 1)
        if len(content) != item['bytes'] or hashlib.sha256(content).hexdigest() != item['sha256']:
            raise RuntimeError('Model integrity check failed: ' + destination.name)
        destination.write_bytes(content)
    license_path = str(Path(item['path']).parent / 'LICENSE')
    with urlopen(f"https://raw.githubusercontent.com/{manifest['repository']}/{manifest['revision']}/{license_path}", timeout=30) as response:
        (ROOT / 'models' / (destination.stem + '.LICENSE')).write_bytes(response.read(100000))
    print('Verified:', destination.name)
