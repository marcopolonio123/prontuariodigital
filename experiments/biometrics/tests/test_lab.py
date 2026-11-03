import base64
import json
import math
import os
from pathlib import Path
import time

import cv2
from cryptography.fernet import Fernet, InvalidToken
from fastapi.testclient import TestClient
import numpy as np
import pytest

from app import Settings, create_app, select_candidate
from engines import ROOT, FaceEngine, FingerprintEngine, SampleError, decode_image, prepare_fingerprint
from store import Store


def synthetic_finger(seed=1, inverted=False):
    """Generated ridges with interruptions, not a human fingerprint or an accuracy dataset."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[:420, :360]
    phase = np.sqrt((x - 180 + seed * 3)**2 + (y - 220)**2) * .64 + np.arctan2(y - 220, x - 180) * 3
    image = np.where(np.sin(phase) > .15, 40, 220).astype('uint8')
    mask = ((x - 180) / 155)**2 + ((y - 210) / 195)**2 < 1
    image[~mask] = 245
    for _ in range(60):
        px, py = rng.integers(65, 295), rng.integers(65, 355)
        cv2.line(image, (int(px), int(py)), (int(px + 8), int(py + 3)), 220, 3)
    if inverted:
        image = 255 - image
    return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)


def encoded(image):
    return base64.b64encode(cv2.imencode('.png', image)[1]).decode()


@pytest.fixture(scope='module')
def real_engines():
    from engines import Engines
    engines = Engines(ROOT / 'fingerprint/target/fingerprint-lab-0.1.0.jar', ROOT / 'models')
    yield engines
    engines.close()


@pytest.fixture()
def client(tmp_path):
    settings = Settings('test-token-' + 'x' * 40, Fernet.generate_key().decode(), tmp_path / 'data',
                        ROOT / 'fingerprint/target/fingerprint-lab-0.1.0.jar', ROOT / 'models', finger_threshold=1.0)
    with TestClient(create_app(settings)) as app:
        yield app, settings, {'Authorization': 'Bearer ' + settings.token}


def capture(seed=1, **extra):
    return {'method': 'finger', 'imageB64': encoded(synthetic_finger(seed)), 'consent': True,
            'source': 'scanner', 'finger': 'right_index', 'dpi': 500.0, **extra}


def volunteer(app, headers, alias='V001'):
    response = app.post('/api/v1/subjects', headers=headers,
                        json={'alias': alias, 'consent': True, 'consentVersion': 'mydoctor-lab-v1'})
    assert response.status_code == 201
    return response.json()['id']


def test_fail_closed_config(tmp_path):
    with pytest.raises(RuntimeError):
        Settings('', '', tmp_path, tmp_path, tmp_path).validate()
    with pytest.raises(RuntimeError):
        Settings('x'*40, 'x', tmp_path, tmp_path, tmp_path, face_threshold=float('nan')).validate()


def test_api_boundary_consent_and_payloads(client):
    app, _, headers = client
    assert app.get('/api/v1/subjects').status_code == 401
    assert app.post('/api/v1/subjects', content=b'x'*3_000_000).status_code == 401
    assert app.post('/api/v1/subjects', headers={**headers, 'Origin': 'https://foreign.test'}, json={}).status_code == 403
    assert app.post('/api/v1/subjects', headers=headers, json={'alias':'V001','consent':False,'consentVersion':'mydoctor-lab-v1'}).status_code == 422
    assert app.post('/api/v1/subjects', headers=headers, json={'alias':'Nome Completo','consent':True,'consentVersion':'mydoctor-lab-v1'}).status_code == 422
    assert app.post('/api/v1/trials', headers=headers, json={**capture(), 'identityConfirmed':True}).status_code == 422
    assert app.post('/api/v1/trials', headers=headers, json={**capture(), 'consent':False}).status_code == 422
    assert app.post('/api/v1/trials', headers=headers, json={**capture(), 'source':'camera'}).status_code == 422
    assert app.post('/api/v1/trials', headers=headers, json={**capture(), 'imageB64':'x'*3_000_000}).status_code == 413
    invalid = app.post('/api/v1/trials', headers=headers, json={**capture(), 'dpi':'NOT-A-NUMBER'})
    assert 'imageB64' not in invalid.text and 'NOT-A-NUMBER' not in invalid.text
    assert app.get('/docs').status_code == 404
    assert app.get('/').headers['content-security-policy'].find("frame-ancestors 'none'") >= 0


def test_original_negative_shadow_preview(client):
    app, _, headers = client
    image = synthetic_finger()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    negative = prepare_fingerprint(image, 'original', 'negative')
    assert np.array_equal(negative, 255 - gray)
    assert np.array_equal(prepare_fingerprint(image), gray)
    shadowed = prepare_fingerprint(image, 'shadows', 'original')
    assert shadowed.shape == gray.shape and shadowed.dtype == gray.dtype
    response = app.post('/api/v1/preview', headers=headers, json=capture(processing='shadows', polarity='negative'))
    assert response.status_code == 200
    assert response.json()['retained'] is False and response.json()['biometricComparisonPerformed'] is False
    assert app.get('/api/v1/subjects', headers=headers).json()['items'] == []


def test_real_sourceafis_extraction_polarity_and_calibration(real_engines):
    finger = real_engines.finger
    original = synthetic_finger()
    template, quality = finger.extract(original, 'scanner', 500)
    inverted, _ = finger.extract(255-original, 'scanner', 500, polarity='negative')
    score = finger.score(template, template)
    # Synthetic ridges are not a human biometric dataset. Test computation, not population accuracy.
    assert math.isfinite(score) and score > 0
    assert finger.score(template, inverted) == pytest.approx(score)
    assert quality['contactlessValidated'] is False
    with pytest.raises(SampleError):
        finger.extract(original, 'camera_calibrated', width_mm=None)
    _, info = finger.extract(original, 'camera_calibrated', width_mm=18.0)
    assert info['dpi'] == pytest.approx(360*25.4/18, abs=.01)


def test_real_face_engine_invalid_and_feature_pipeline(real_engines):
    # Real model load/inference, no human images. Detection must reject an unrelated ridge image.
    with pytest.raises(SampleError):
        real_engines.face.extract(synthetic_finger())
    # Smoke only for the actual SFace ONNX feature pipeline. This is NOT facial accuracy evidence.
    aligned = np.random.default_rng(7).integers(0, 256, (112, 112, 3), dtype=np.uint8)
    feature = real_engines.face.recognizer.feature(aligned).flatten()
    feature /= np.linalg.norm(feature)
    assert feature.size == 128 and FaceEngine.score(feature.tolist(), feature.tolist()) > .999


def test_enroll_trial_no_production_side_effects_and_revoke(client):
    app, settings, headers = client
    subject = volunteer(app, headers)
    url = '/api/v1/subjects/' + subject + '/samples'
    first = app.post(url, headers=headers, json=capture())
    assert first.status_code == 201 and first.json()['identityConfirmed'] is False
    assert app.post(url, headers=headers, json=capture()).status_code == 409
    assert app.post('/api/v1/subjects/nonexistent/samples', headers=headers, json=capture()).status_code == 409
    assert app.post(url, headers=headers, json=capture(2)).status_code == 201
    result = app.post('/api/v1/trials', headers=headers, json={**capture(), 'groundTruthKnown':True, 'expectedSubjectId':subject})
    assert result.status_code == 200, result.text
    value = result.json()
    assert value['decision'] == 'candidate_for_review'
    assert value['candidate']['subjectId'] == subject
    assert value['reusedEnrollmentImage'] is True
    assert not any(value[key] for key in ('identityConfirmed', 'familyNotified', 'clinicalAccessGranted', 'thresholdsValidated'))
    assert 'template' not in result.text and 'imageB64' not in result.text
    for file in settings.data_dir.glob('*.bin'):
        data = file.read_bytes()
        assert not data.startswith(b'{') and b'"imageB64"' not in data and b'"template"' not in data
        with pytest.raises(InvalidToken):
            Fernet(Fernet.generate_key()).decrypt(data)
        assert len(json.loads(Fernet(settings.encryption_key.encode()).decrypt(data))['imageB64']) > 20
    metrics = app.get('/api/v1/metrics', headers=headers).json()
    assert metrics['metrics']['finger']['labeledIndependentTrials'] == 0
    assert metrics['metrics']['finger']['reusedEnrollmentImages'] == 1
    assert metrics['accuracyValidated'] is False
    assert app.delete('/api/v1/subjects/'+subject, headers=headers).status_code == 200
    assert not list(settings.data_dir.glob('*.bin'))
    assert app.get('/api/v1/metrics', headers=headers).json()['metrics']['finger']['trials'] == 0
    assert app.get('/api/v1/subjects', headers=headers).json()['items'] == []


def test_no_reference_capture_rejection_and_cleanup(client):
    app, _, headers = client
    result = app.post('/api/v1/trials', headers=headers, json=capture())
    assert result.json()['decision'] == 'no_reference' and result.json()['candidate'] is None
    bad = app.post('/api/v1/trials', headers=headers, json={**capture(), 'imageB64':base64.b64encode(b'not-a-picture').decode()+'===='})
    assert bad.status_code == 422
    assert app.get('/api/v1/metrics', headers=headers).json()['metrics']['finger']['captureRejections'] == 1
    assert app.delete('/api/v1/lab', headers=headers).status_code == 400
    assert app.delete('/api/v1/lab', headers={**headers,'X-Confirm-Clear':'DELETE-LAB'}).status_code == 200


def test_score_selection_is_not_confidence_and_requires_margin():
    rows = {'a':{'subjectId':'a','score':.8}, 'b':{'subjectId':'b','score':.76}}
    assert select_candidate(rows,.5,.1)[0] == 'ambiguous'
    assert select_candidate(rows,.9,.01)[0] == 'no_candidate'
    assert select_candidate(rows,.5,.01)[0] == 'candidate_for_review'
    assert select_candidate({},.5,.1)[0] == 'no_reference'


def test_retention_and_unlinked_files(tmp_path):
    key = Fernet.generate_key().decode()
    store = Store(tmp_path, key)
    subject = store.create_subject('V001',24)
    (tmp_path/'orphan.bin').write_bytes(b'encrypted-orphan')
    with store.connect() as db:
        db.execute('UPDATE subjects SET expires_at=? WHERE id=?',(time.time()-1,subject))
    store = Store(tmp_path,key)
    assert store.subjects() == [] and not (tmp_path/'orphan.bin').exists()


def test_size_and_uniform_image_rejected():
    with pytest.raises(SampleError):
        decode_image(base64.b64encode(b'garbage').decode())
    from engines import quality
    with pytest.raises(SampleError):
        quality(np.zeros((200,200,3),dtype=np.uint8))
