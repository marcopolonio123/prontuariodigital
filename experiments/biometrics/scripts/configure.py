"""Create local secrets without printing them. Never put the generated .env in git."""
import os
from pathlib import Path
import secrets
from cryptography.fernet import Fernet

root = Path(__file__).resolve().parents[1]
path = root / '.env'
with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as output:
    output.write('BIO_LAB_ENABLED=1\n')
    output.write('BIO_LAB_TOKEN=' + secrets.token_urlsafe(48) + '\n')
    output.write('BIO_LAB_ENCRYPTION_KEY=' + Fernet.generate_key().decode() + '\n')
    output.write('BIO_LAB_RETENTION_HOURS=24\n')
    output.write('BIO_LAB_FINGER_THRESHOLD=40\nBIO_LAB_FACE_THRESHOLD=0.50\n')
    output.write('BIO_LAB_FINGER_MARGIN=10\nBIO_LAB_FACE_MARGIN=0.10\n')
print('Configuração criada em .env. Consulte BIO_LAB_TOKEN localmente; não envie a chave no chat.')
