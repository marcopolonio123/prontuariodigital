"""Private experimental biometric API. Run with one worker, on loopback or a private network."""
import base64
import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
import hmac
import json
import math
import os
from pathlib import Path
import re
import threading
import time
from typing import Literal

import cv2
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from engines import ROOT, Engines, EngineUnavailable, SampleError, decode_image, prepare_fingerprint
from store import Store, StoreError

MAX_REQUEST = 2_800_000
CONSENT_TEXT = ('Participação voluntária no laboratório MyDoctor para testar comparação facial e digital. '
                'Imagens e modelos biométricos serão guardados criptografados pelo prazo informado, '
                'sem acesso a prontuários nem avisos a familiares. É possível excluir a participação a qualquer momento.')


@dataclass(frozen=True)
class Settings:
    token: str
    encryption_key: str
    data_dir: Path
    jar: Path
    model_dir: Path
    retention_hours: int = 24
    finger_threshold: float = 40.0
    face_threshold: float = 0.50
    finger_margin: float = 10.0
    face_margin: float = 0.10

    def validate(self):
        if len(self.token) < 32 or not self.encryption_key or not 1 <= self.retention_hours <= 168:
            raise RuntimeError('Configure token de pelo menos 32 caracteres, chave Fernet e retenção de 1 a 168 horas.')
        if not all(math.isfinite(value) for value in (self.finger_threshold, self.face_threshold, self.finger_margin, self.face_margin)):
            raise RuntimeError('Limiares inválidos.')
        if self.finger_threshold <= 0 or not -1 < self.face_threshold <= 1 or self.finger_margin < 0 or not 0 <= self.face_margin <= 2:
            raise RuntimeError('Limiares inválidos.')

    @classmethod
    def environment(cls):
        if os.getenv('BIO_LAB_ENABLED') != '1':
            raise RuntimeError('Laboratório desativado. Configure BIO_LAB_ENABLED=1 para testes isolados.')
        return cls(token=os.getenv('BIO_LAB_TOKEN', ''), encryption_key=os.getenv('BIO_LAB_ENCRYPTION_KEY', ''),
                   data_dir=Path(os.getenv('BIO_LAB_DATA', str(ROOT / 'data'))),
                   jar=Path(os.getenv('BIO_LAB_FINGERPRINT_JAR', str(ROOT / 'fingerprint/target/fingerprint-lab-0.1.0.jar'))),
                   model_dir=Path(os.getenv('BIO_LAB_MODELS', str(ROOT / 'models'))),
                   retention_hours=int(os.getenv('BIO_LAB_RETENTION_HOURS', '24')),
                   finger_threshold=float(os.getenv('BIO_LAB_FINGER_THRESHOLD', '40')),
                   face_threshold=float(os.getenv('BIO_LAB_FACE_THRESHOLD', '0.50')),
                   finger_margin=float(os.getenv('BIO_LAB_FINGER_MARGIN', '10')),
                   face_margin=float(os.getenv('BIO_LAB_FACE_MARGIN', '0.10')))


class StrictInput(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False, strict=True)


class Volunteer(StrictInput):
    alias: str = Field(pattern=r'^[A-Z0-9_-]{2,24}$')
    consent: Literal[True]
    consentVersion: Literal['mydoctor-lab-v1']


class Capture(StrictInput):
    method: Literal['finger', 'face']
    imageB64: str = Field(min_length=20, max_length=2_700_000)
    consent: Literal[True]
    source: Literal['scanner', 'camera_calibrated', 'camera'] = 'camera'
    finger: Literal['right_index', 'left_index'] | None = None
    dpi: float | None = Field(default=None, ge=72, le=2000)
    widthMm: float | None = Field(default=None, ge=5, le=80)
    polarity: Literal['original', 'negative'] = 'original'
    processing: Literal['original', 'contrast', 'shadows'] = 'original'

    @model_validator(mode='after')
    def modality(self):
        if self.method == 'finger' and (self.finger is None or self.source == 'camera'):
            raise ValueError('Digital exige indicação do dedo e resolução medida, não estimada.')
        if self.method == 'face' and (self.finger is not None or self.polarity != 'original' or self.processing != 'original' or self.source != 'camera'):
            raise ValueError('Tratamentos de digital não se aplicam à modalidade facial.')
        return self


class Trial(Capture):
    groundTruthKnown: bool = False
    expectedSubjectId: str | None = None

    @model_validator(mode='after')
    def ground_truth(self):
        if self.expectedSubjectId is not None and not self.groundTruthKnown:
            raise ValueError('Informe explicitamente que o resultado esperado é conhecido.')
        return self


def select_candidate(scores, threshold, margin):
    ranked = sorted(scores.values(), key=lambda row: row['score'], reverse=True)
    if not ranked:
        return 'no_reference', None, []
    if ranked[0]['score'] < threshold:
        return 'no_candidate', None, ranked[:3]
    if len(ranked) > 1 and ranked[0]['score'] - ranked[1]['score'] < margin:
        return 'ambiguous', None, ranked[:3]
    return 'candidate_for_review', ranked[0], ranked[:3]


def create_app(settings=None):
    config = settings or Settings.environment()
    config.validate()
    lock = threading.Lock()
    resources = {}

    @asynccontextmanager
    async def lifespan(app):
        resources['store'] = Store(config.data_dir, config.encryption_key)
        resources['engines'] = Engines(config.jar, config.model_dir)
        def purge_expired():
            if lock.acquire(blocking=False):
                try:
                    resources['store'].purge()
                finally:
                    lock.release()
        async def cleanup_loop():
            while True:
                await asyncio.sleep(60)
                await asyncio.to_thread(purge_expired)
        cleanup = asyncio.create_task(cleanup_loop())
        try:
            yield
        finally:
            cleanup.cancel()
            try:
                await cleanup
            except asyncio.CancelledError:
                pass
            resources['engines'].close()

    app = FastAPI(title='MyDoctor — laboratório biométrico privado', version='0.1.0', lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware('http')
    async def boundary(request: Request, call_next):
        if request.url.path.startswith('/api/'):
            expected = 'Bearer ' + config.token
            if not hmac.compare_digest(request.headers.get('authorization', '').encode(), expected.encode()):
                return JSONResponse({'error': 'Acesso restrito ao laboratório.'}, status_code=401)
            origin = request.headers.get('origin')
            if origin and origin != str(request.base_url).rstrip('/'):
                return JSONResponse({'error': 'Origem não autorizada.'}, status_code=403)
            content = bytearray()
            async for chunk in request.stream():
                content.extend(chunk)
                if len(content) > MAX_REQUEST:
                    return JSONResponse({'error': 'Solicitação muito grande.'}, status_code=413)
            request._body = bytes(content)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, error):
        # Pydantic's normal error response can echo the entire submitted image. Never do that here.
        return JSONResponse({'error': 'Confira os campos, o consentimento e os parâmetros da captura.'}, status_code=422)

    for error_type, status in ((SampleError, 422), (StoreError, 409), (EngineUnavailable, 503)):
        async def handle(request, error, status=status):
            return JSONResponse({'error': str(error)}, status_code=status)
        app.add_exception_handler(error_type, handle)

    def enter():
        if not lock.acquire(blocking=False):
            raise HTTPException(429, 'Outro ensaio está em execução. Aguarde.')
        try:
            resources['store'].purge()
        except Exception:
            lock.release()
            raise

    @app.get('/health')
    def health():
        return {'ok': bool(resources), 'mode': 'isolated_experiment', 'identityConfirmed': False}

    @app.get('/')
    def home():
        return FileResponse(ROOT / 'web/index.html')

    @app.get('/lab.js')
    def javascript():
        return FileResponse(ROOT / 'web/lab.js', media_type='text/javascript')

    @app.get('/lab.css')
    def stylesheet():
        return FileResponse(ROOT / 'web/lab.css', media_type='text/css')

    @app.get('/api/v1/status')
    def status():
        return {'mode': 'isolated_experiment', 'consentVersion': 'mydoctor-lab-v1', 'consentText': CONSENT_TEXT,
                'retentionHours': config.retention_hours, 'fingerEngine': resources['engines'].finger.version,
                'faceEngine': resources['engines'].face.version,
                'thresholds': {'finger': config.finger_threshold, 'face': config.face_threshold},
                'margins': {'finger': config.finger_margin, 'face': config.face_margin},
                'thresholdsValidated': False, 'familyNotificationsEnabled': False, 'clinicalAccessEnabled': False,
                'livenessPerformed': False, 'postmortemValidated': False,
                'scoreMeaning': 'engine_specific_similarity_not_probability'}

    @app.get('/api/v1/subjects')
    def subjects():
        enter()
        try:
            return {'items': resources['store'].subjects()}
        finally:
            lock.release()

    @app.post('/api/v1/subjects', status_code=201)
    def enroll_volunteer(payload: Volunteer):
        enter()
        try:
            subject_id = resources['store'].create_subject(payload.alias, config.retention_hours)
            return {'id': subject_id, 'alias': payload.alias, 'consentVersion': payload.consentVersion}
        finally:
            lock.release()

    @app.post('/api/v1/subjects/{subject_id}/samples', status_code=201)
    def enroll_sample(subject_id: str, payload: Capture):
        enter()
        try:
            resources['store'].subject(subject_id)
            envelope = resources['engines'].extract(payload)
            sample_id = resources['store'].add_sample(subject_id, payload, envelope)
            return {'id': sample_id, 'method': payload.method, 'quality': envelope['quality'],
                    'extractMs': envelope['extractMs'], 'identityConfirmed': False}
        finally:
            lock.release()

    @app.post('/api/v1/preview')
    def preview(payload: Capture):
        enter()
        try:
            if payload.method != 'finger':
                raise SampleError('Pré-processamento disponível somente para a digital.')
            image = decode_image(payload.imageB64)
            processed = prepare_fingerprint(image, payload.processing, payload.polarity)
            ok, png = cv2.imencode('.png', processed)
            if not ok:
                raise SampleError('Não foi possível preparar a prévia.')
            return {'imageB64': base64.b64encode(png).decode(), 'retained': False,
                    'processing': payload.processing, 'polarity': payload.polarity,
                    'biometricComparisonPerformed': False}
        finally:
            lock.release()

    @app.post('/api/v1/trials')
    def trial(payload: Trial):
        enter()
        started = time.perf_counter()
        try:
            store, engines = resources['store'], resources['engines']
            if payload.expectedSubjectId:
                store.subject(payload.expectedSubjectId)
            envelope = engines.extract(payload)
            references = store.references(payload, envelope['engine'])
            if payload.expectedSubjectId and not any(row['subject_id'] == payload.expectedSubjectId for row, _ in references):
                raise SampleError('O voluntário esperado não possui referência compatível com esta modalidade/dedo/origem.')
            engine = engines.face if payload.method == 'face' else engines.finger
            scores, counts = {}, {}
            reused = False
            compare_started = time.perf_counter()
            for row, reference in references:
                if time.perf_counter() - started > 30:
                    raise EngineUnavailable('O ensaio excedeu o tempo de processamento do laboratório.')
                reused |= reference['imageSha'] == envelope['imageSha']
                subject_id = row['subject_id']
                counts[subject_id] = counts.get(subject_id, 0) + 1
                score = engine.score(envelope['template'], reference['template'])
                if subject_id not in scores or score > scores[subject_id]['score']:
                    scores[subject_id] = {'subjectId': subject_id, 'alias': row['alias'], 'score': score}
            # At least two different stored images for this modality/finger/source before candidate selection.
            eligible = {subject_id: row for subject_id, row in scores.items() if counts[subject_id] >= 2}
            if payload.expectedSubjectId and payload.expectedSubjectId not in eligible:
                raise SampleError('Cadastre duas capturas independentes e compatíveis antes de avaliar esse voluntário.')
            threshold = config.face_threshold if payload.method == 'face' else config.finger_threshold
            margin = config.face_margin if payload.method == 'face' else config.finger_margin
            decision, candidate, ranked = select_candidate(eligible, threshold, margin)
            engine_ms = envelope['extractMs'] + (time.perf_counter() - compare_started) * 1000
            latency_ms = (time.perf_counter() - started) * 1000
            trial_id = store.record_trial(payload.method, payload.expectedSubjectId, candidate['subjectId'] if candidate else None,
                                          payload.groundTruthKnown, decision, reused, latency_ms, engine_ms, len(eligible), payload.processing + '/' + payload.polarity)
            return {'trialId': trial_id, 'mode': 'isolated_experiment', 'decision': decision,
                    'candidate': candidate, 'topCandidates': ranked, 'eligibleSubjects': len(eligible),
                    'ineligibleSubjects': len(scores) - len(eligible), 'referenceSamples': len(references),
                    'quality': envelope['quality'], 'latencyMs': round(latency_ms, 2), 'engineMs': round(engine_ms, 2),
                    'reusedEnrollmentImage': reused, 'threshold': threshold, 'margin': margin,
                    'identityConfirmed': False, 'familyNotified': False, 'clinicalAccessGranted': False,
                    'thresholdsValidated': False, 'warning': 'Resultado experimental para revisão. Escore não é probabilidade.'}
        except SampleError:
            resources['store'].record_trial(payload.method, payload.expectedSubjectId, None, payload.groundTruthKnown,
                                             'capture_rejected', False, (time.perf_counter() - started) * 1000, 0, 0,
                                             payload.processing + '/' + payload.polarity)
            raise
        finally:
            lock.release()

    @app.get('/api/v1/metrics')
    def metrics():
        enter()
        try:
            store = resources['store']
            return {'mode': 'isolated_experiment', 'metrics': store.metrics(), 'storageBytes': store.bytes_used(),
                    'pricingEstimateAvailable': False, 'accuracyValidated': False,
                    'limitations': ['Resultados dependem dos rótulos informados pelo operador.',
                                    'Reutilização exata de imagem cadastrada é excluída das taxas.',
                                    'Capturas correlacionadas e base pequena não validam uso real.',
                                    'Tempo e bytes medidos não constituem estimativa de custo de hospedagem.']}
        finally:
            lock.release()

    @app.delete('/api/v1/subjects/{subject_id}')
    def revoke(subject_id: str):
        enter()
        try:
            resources['store'].revoke(subject_id)
            return {'removed': True, 'samplesDeleted': True, 'associatedTrialsDeleted': True}
        finally:
            lock.release()

    @app.delete('/api/v1/lab')
    def clear(request: Request):
        if request.headers.get('x-confirm-clear') != 'DELETE-LAB':
            raise HTTPException(400, 'Confirme a limpeza do laboratório.')
        enter()
        try:
            resources['store'].clear()
            return {'removed': True}
        finally:
            lock.release()

    return app
