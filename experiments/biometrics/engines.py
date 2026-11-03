"""Real experimental engines. Never substitute image hashes for biometric matching."""
import base64
import hashlib
import io
import json
import math
import selectors
import subprocess
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

ROOT = Path(__file__).resolve().parent
MAX_IMAGE_BYTES = 2_000_000
MAX_PIXELS = 4_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
cv2.setNumThreads(1)


class SampleError(ValueError):
    pass


class EngineUnavailable(RuntimeError):
    pass


def decode_image(encoded):
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise SampleError('Use JPEG ou PNG de até 2 MB.')
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in ('JPEG', 'PNG') or getattr(image, 'n_frames', 1) != 1:
                raise SampleError('Use uma imagem JPEG ou PNG estática.')
            width, height = image.size
            if min(width, height) < 160 or width * height > MAX_PIXELS:
                raise SampleError('A imagem precisa ter pelo menos 160 px por lado e até 4 megapixels.')
            rgb = np.asarray(image.convert('RGB'))
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise SampleError('Não foi possível ler a imagem dentro dos limites do laboratório.') from error
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def quality(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
    values = {'width': int(gray.shape[1]), 'height': int(gray.shape[0]),
              'brightness': round(float(gray.mean()), 2), 'contrast': round(float(gray.std()), 2),
              'sharpness': round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2)}
    if values['contrast'] < 12 or values['sharpness'] < 20 or not 20 < values['brightness'] < 235:
        raise SampleError('Amostra pouco nítida, escura, clara ou sem contraste. Capture novamente.')
    return values


def image_digest(image):
    return hashlib.sha256(str(image.shape).encode() + image.tobytes()).hexdigest()


def prepare_fingerprint(image, processing='original', polarity='original'):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    if processing == 'shadows':
        # Estimate slow illumination changes, not ridge geometry. Never add/generate ridges.
        background = cv2.GaussianBlur(gray, (0, 0), 21)
        gray = cv2.divide(gray, np.maximum(background, 1), scale=160)
    if processing in ('contrast', 'shadows'):
        gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    if polarity == 'negative':
        gray = cv2.bitwise_not(gray)
    return gray


class FingerprintEngine:
    version = 'SourceAFIS-3.18.1'

    def __init__(self, jar):
        self.jar = Path(jar)
        self.process = None
        self.selector = None
        if not self.jar.is_file():
            raise EngineUnavailable('Compile o motor de digital antes de iniciar o laboratório.')
        self.start()

    def start(self):
        self.close()
        self.process = subprocess.Popen(['java', '-Xmx512m', '-Djava.awt.headless=true', '-jar', str(self.jar)],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        if self.read() != 'ready\t' + self.version:
            self.close()
            raise EngineUnavailable('O motor de digital não iniciou.')

    def read(self):
        if not self.selector.select(timeout=25):
            self.close()
            raise EngineUnavailable('Tempo de processamento da digital excedido.')
        line = self.process.stdout.readline(4_000_000)
        if not line:
            self.close()
            raise EngineUnavailable('Motor de digital indisponível.')
        return line.decode().rstrip('\n')

    def call(self, *parts):
        if self.process is None or self.process.poll() is not None:
            self.start()
        try:
            self.process.stdin.write(('\t'.join(parts) + '\n').encode())
            self.process.stdin.flush()
            result = self.read().split('\t', 1)
            if result[0] != 'ok' or len(result) != 2:
                raise SampleError('Não foi possível extrair ou comparar a digital. Tente outra captura.')
            return result[1]
        except (OSError, UnicodeError) as error:
            self.close()
            raise EngineUnavailable('Motor de digital indisponível.') from error

    def extract(self, image, source, dpi=None, width_mm=None, polarity='original', processing='original'):
        info = quality(image)
        if source == 'camera_calibrated':
            if width_mm is None or not math.isfinite(width_mm) or not 5 <= width_mm <= 80:
                raise SampleError('Informe a largura física, em mm, da região recortada usando uma referência de escala.')
            resolution = image.shape[1] * 25.4 / width_mm
        elif source == 'scanner':
            if dpi is None:
                raise SampleError('Informe a resolução real do leitor. Não estime DPI para fotos.')
            resolution = dpi
        else:
            raise SampleError('Digital exige leitor com DPI conhecido ou foto recortada com escala física medida.')
        if not math.isfinite(resolution) or not 72 <= resolution <= 2000:
            raise SampleError('A resolução calculada está fora dos limites de teste (72–2000 DPI).')
        gray = prepare_fingerprint(image, processing, polarity)
        # No fabricated ridges, image-hash similarity, or assumed 500 DPI for camera photos.
        ok, png = cv2.imencode('.png', gray)
        if not ok:
            raise SampleError('Não foi possível preparar a digital.')
        template = self.call('extract', str(resolution), base64.b64encode(png).decode())
        return template, {**info, 'dpi': round(resolution, 2), 'source': source, 'polarity': polarity, 'processing': processing,
                          'qualityType': 'photographic_only_not_NFIQ', 'contactlessValidated': False}

    def score(self, probe, reference):
        value = float(self.call('match', probe, reference))
        if not math.isfinite(value):
            raise EngineUnavailable('O motor retornou um escore inválido.')
        return value

    def close(self):
        if self.selector is not None:
            self.selector.close()
            self.selector = None
        if self.process is not None:
            self.process.kill()
            self.process.communicate(timeout=5)
            self.process = None


class FaceEngine:
    version = 'OpenCV-4.11.0-YuNet2023mar-SFace2021dec'

    def __init__(self, model_dir):
        manifest = json.loads((ROOT / 'models/manifest.json').read_text())
        for item in manifest['files']:
            path = Path(model_dir) / Path(item['path']).name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
                raise EngineUnavailable('Baixe e verifique os modelos faciais antes de iniciar.')
        self.detector = cv2.FaceDetectorYN.create(str(Path(model_dir) / 'face_detection_yunet_2023mar.onnx'), '', (320, 320), 0.9)
        self.recognizer = cv2.FaceRecognizerSF.create(str(Path(model_dir) / 'face_recognition_sface_2021dec.onnx'), '')

    def extract(self, image):
        quality(image)
        # Limit detector work without changing the full-resolution crop used by the recognizer.
        ratio = min(1.0, 960 / max(image.shape[:2]))
        preview = cv2.resize(image, None, fx=ratio, fy=ratio) if ratio < 1 else image
        self.detector.setInputSize((preview.shape[1], preview.shape[0]))
        _, faces = self.detector.detect(preview)
        if faces is None or len(faces) != 1:
            raise SampleError('A captura deve conter exatamente um rosto detectável.')
        face = faces[0].copy()
        face[:14] /= ratio
        if min(face[2:4]) < 100:
            raise SampleError('O rosto está pequeno. Aproxime a câmera.')
        aligned = self.recognizer.alignCrop(image, face)
        info = quality(aligned)
        feature = self.recognizer.feature(aligned).flatten().astype(np.float32)
        feature /= np.linalg.norm(feature)
        return feature.tolist(), {**info, 'detectedFaces': 1, 'livenessPerformed': False,
                                  'closedEyesValidated': False, 'postmortemValidated': False}

    @staticmethod
    def score(probe, reference):
        value = float(np.dot(np.asarray(probe, dtype=np.float32), np.asarray(reference, dtype=np.float32)))
        if not math.isfinite(value):
            raise EngineUnavailable('O motor retornou um escore inválido.')
        return float(np.clip(value, -1, 1))


class Engines:
    def __init__(self, jar, model_dir):
        self.face = FaceEngine(model_dir)
        self.finger = FingerprintEngine(jar)

    def extract(self, payload):
        started = time.perf_counter()
        image = decode_image(payload.imageB64)
        engine = self.face if payload.method == 'face' else self.finger
        template, info = engine.extract(image) if payload.method == 'face' else engine.extract(image, payload.source, payload.dpi, payload.widthMm, payload.polarity, payload.processing)
        ok, png = cv2.imencode('.png', image)
        if not ok:
            raise SampleError('Imagem inválida.')
        return {'template': template, 'engine': engine.version, 'quality': info,
                'imageSha': image_digest(image), 'imageB64': base64.b64encode(png).decode(),
                'extractMs': round((time.perf_counter() - started) * 1000, 2)}

    def close(self):
        self.finger.close()
