"""Pseudonymous lab metadata in SQLite, encrypted images/templates in private files.

This does not import MyDoctor users, avatars, patient records or production storage.
"""
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class StoreError(ValueError):
    pass


class Store:
    def __init__(self, directory, key):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)
        self.cipher = Fernet(key.encode())
        self.database = self.directory / 'metadata.sqlite3'
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS subjects (
                    id TEXT PRIMARY KEY, alias TEXT UNIQUE NOT NULL,
                    consent_version TEXT NOT NULL, consent_at REAL NOT NULL, expires_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS samples (
                    id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
                    method TEXT NOT NULL CHECK(method IN ('face','finger')), finger TEXT NOT NULL,
                    source TEXT NOT NULL, polarity TEXT NOT NULL, engine TEXT NOT NULL, created_at REAL NOT NULL);
                CREATE TABLE IF NOT EXISTS trials (
                    id TEXT PRIMARY KEY, method TEXT NOT NULL, expected_id TEXT,
                    candidate_id TEXT, ground_truth INTEGER NOT NULL, decision TEXT NOT NULL,
                    reused INTEGER NOT NULL, latency_ms REAL NOT NULL, engine_ms REAL NOT NULL,
                    candidates INTEGER NOT NULL, created_at REAL NOT NULL,
                    variant TEXT NOT NULL DEFAULT 'original/original');
                CREATE INDEX IF NOT EXISTS sample_subject ON samples(subject_id);
            ''')
        os.chmod(self.database, 0o600)
        self.purge()
        # A failed/crashed enrollment can leave a private encrypted file; it has no valid metadata.
        with self.connect() as db:
            live = {row['id'] for row in db.execute('SELECT id FROM samples')}
        for file in self.directory.iterdir():
            if file.suffix == '.tmp' or (file.suffix == '.bin' and file.stem not in live):
                file.unlink()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA secure_delete=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def purge(self):
        with self.connect() as db:
            ids = [row['id'] for row in db.execute('SELECT id FROM subjects WHERE expires_at<=?', (time.time(),))]
        for subject_id in ids:
            self.revoke(subject_id)
        with self.connect() as db:
            db.execute('DELETE FROM trials WHERE created_at<?', (time.time() - 7 * 86400,))

    def subjects(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute('''SELECT s.id,s.alias,s.consent_at,s.expires_at,
                (SELECT count(*) FROM samples p WHERE p.subject_id=s.id AND method='face') face_samples,
                (SELECT count(*) FROM samples p WHERE p.subject_id=s.id AND method='finger') finger_samples
                FROM subjects s ORDER BY alias''')]

    def create_subject(self, alias, retention_hours):
        now = time.time()
        subject_id = str(uuid.uuid4())
        with self.connect() as db:
            if db.execute('SELECT count(*) FROM subjects').fetchone()[0] >= 100:
                raise StoreError('O laboratório admite no máximo 100 voluntários por instalação.')
            try:
                db.execute('INSERT INTO subjects VALUES (?,?,?,?,?)',
                           (subject_id, alias, 'mydoctor-lab-v1', now, now + retention_hours * 3600))
            except sqlite3.IntegrityError as error:
                raise StoreError('Esse código de voluntário já está cadastrado.') from error
        return subject_id

    def subject(self, subject_id):
        with self.connect() as db:
            value = db.execute('SELECT * FROM subjects WHERE id=? AND expires_at>?', (subject_id, time.time())).fetchone()
        if value is None:
            raise StoreError('Voluntário indisponível ou consentimento expirado.')
        return dict(value)

    def read_sample(self, sample_id):
        try:
            return json.loads(self.cipher.decrypt((self.directory / (sample_id + '.bin')).read_bytes()))
        except (InvalidToken, OSError, ValueError) as error:
            raise StoreError('Amostra indisponível. Não foi possível verificar a integridade.') from error

    def add_sample(self, subject_id, payload, envelope):
        self.subject(subject_id)
        with self.connect() as db:
            previous = db.execute('SELECT id FROM samples WHERE subject_id=?', (subject_id,)).fetchall()
            if len(previous) >= 8:
                raise StoreError('Limite de oito amostras por voluntário.')
        for row in previous:
            if self.read_sample(row['id'])['imageSha'] == envelope['imageSha']:
                raise StoreError('Esta imagem já foi cadastrada. Use outra captura independente.')
        sample_id = str(uuid.uuid4())
        temporary = self.directory / (sample_id + '.tmp')
        final = self.directory / (sample_id + '.bin')
        content = self.cipher.encrypt(json.dumps(envelope, allow_nan=False).encode())
        if self.bytes_used() + len(content) > 512 * 1024 * 1024:
            raise StoreError('O laboratório atingiu 512 MB. Exclua amostras antes de continuar.')
        try:
            with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'wb') as file:
                file.write(content)
                file.flush()
                os.fsync(file.fileno())
            temporary.replace(final)
            with self.connect() as db:
                db.execute('INSERT INTO samples VALUES (?,?,?,?,?,?,?,?)',
                           (sample_id, subject_id, payload.method, payload.finger or '', payload.source,
                            payload.polarity, envelope['engine'], time.time()))
        except Exception:
            temporary.unlink(missing_ok=True)
            final.unlink(missing_ok=True)
            raise
        return sample_id

    def references(self, payload, engine):
        with self.connect() as db:
            rows = db.execute('''SELECT p.*,s.alias FROM samples p JOIN subjects s ON s.id=p.subject_id
                WHERE method=? AND engine=? AND s.expires_at>? AND (?='face' OR (finger=? AND source=?))''',
                              (payload.method, engine, time.time(), payload.method, payload.finger or '', payload.source)).fetchall()
        return [(dict(row), self.read_sample(row['id'])) for row in rows]

    def record_trial(self, method, expected_id, candidate_id, known, decision, reused, latency_ms, engine_ms, candidates, variant='original/original'):
        trial_id = str(uuid.uuid4())
        with self.connect() as db:
            if db.execute('SELECT count(*) FROM trials').fetchone()[0] >= 10000:
                raise StoreError('Limite de 10 mil ensaios. Exporte as métricas e limpe o laboratório.')
            db.execute('INSERT INTO trials VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
                       (trial_id, method, expected_id, candidate_id, int(known), decision, int(reused), latency_ms, engine_ms, candidates, time.time(), variant))
        return trial_id

    def metrics(self):
        with self.connect() as db:
            rows = [dict(row) for row in db.execute('SELECT * FROM trials')]
        result = {}
        for method in ('finger', 'face'):
            trials = [row for row in rows if row['method'] == method]
            rejected = [row for row in trials if row['decision'] == 'capture_rejected']
            labeled = [row for row in trials if row['ground_truth'] and not row['reused'] and row['decision'] != 'capture_rejected']
            genuine = [row for row in labeled if row['expected_id'] is not None]
            unknown = [row for row in labeled if row['expected_id'] is None]
            false_candidates = sum(row['candidate_id'] is not None and row['candidate_id'] != row['expected_id'] for row in labeled)
            rejected_genuine = sum(row['candidate_id'] != row['expected_id'] for row in genuine)
            unknown_accepted = sum(row['candidate_id'] is not None for row in unknown)
            latencies = sorted(row['latency_ms'] for row in trials)
            result[method] = {
                'trials': len(trials), 'labeledIndependentTrials': len(labeled),
                'captureRejections': len(rejected), 'captureRejectionRate': len(rejected) / len(trials) if trials else None,
                'reusedEnrollmentImages': sum(row['reused'] for row in trials),
                'genuineTrials': len(genuine), 'unenrolledTrials': len(unknown),
                'falseCandidates': false_candidates, 'genuineNotCorrectlyRetrieved': rejected_genuine,
                'unenrolledFalseCandidateRate': unknown_accepted / len(unknown) if unknown else None,
                'genuineNotCorrectlyRetrievedRate': rejected_genuine / len(genuine) if genuine else None,
                'meanLatencyMs': sum(latencies) / len(latencies) if latencies else None,
                'p95LatencyMs': latencies[max(0, int(len(latencies) * .95 + .999) - 1)] if latencies else None,
                'inferenceSecondsTotal': sum(row['engine_ms'] for row in trials) / 1000,
                'variants': {variant: {
                    'trials': sum(row['variant'] == variant for row in trials),
                    'falseCandidates': sum(row['variant'] == variant and row['candidate_id'] is not None and row['candidate_id'] != row['expected_id'] for row in labeled),
                    'captureRejections': sum(row['variant'] == variant for row in rejected),
                } for variant in sorted({row['variant'] for row in trials})},
            }
        return result

    def revoke(self, subject_id):
        with self.connect() as db:
            samples = [row['id'] for row in db.execute('SELECT id FROM samples WHERE subject_id=?', (subject_id,))]
            db.execute('DELETE FROM trials WHERE expected_id=? OR candidate_id=?', (subject_id, subject_id))
            db.execute('DELETE FROM subjects WHERE id=?', (subject_id,))
        for sample_id in samples:
            (self.directory / (sample_id + '.bin')).unlink(missing_ok=True)

    def clear(self):
        for subject in self.subjects():
            self.revoke(subject['id'])
        with self.connect() as db:
            db.execute('DELETE FROM trials')

    def bytes_used(self):
        return sum(file.stat().st_size for file in self.directory.iterdir() if file.is_file())
