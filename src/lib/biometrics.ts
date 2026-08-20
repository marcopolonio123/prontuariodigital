import type { Patient } from './types';

export const MATCH_THRESHOLD = 62;
export const REVIEW_THRESHOLD = 45;

export interface MatchCandidate {
  patient: Patient;
  distance: number;
  confidence: number;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
    img.src = src;
  });
}

/** Difference-hash 8x8 → 64 bits → 16 caracteres hex. */
export async function dHash(
  src: string | HTMLImageElement | HTMLCanvasElement,
  size = 8,
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = size + 1;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponível.');
  if (src instanceof HTMLCanvasElement) {
    ctx.drawImage(src, 0, 0, size + 1, size);
  } else {
    const el = typeof src === 'string' ? await loadImage(src) : src;
    ctx.drawImage(el, 0, 0, size + 1, size);
  }
  const data = ctx.getImageData(0, 0, size + 1, size).data;
  const lum = (x: number, y: number) => {
    const o = (y * (size + 1) + x) * 4;
    return data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
  };
  let bits = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) bits += lum(x, y) < lum(x + 1, y) ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hamming(a: string, b: string): number {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export function confidenceFromDistance(distance: number): number {
  const sim = 1 - Math.min(64, distance) / 64;
  const t = Math.max(0, Math.min(1, (sim - 0.42) / 0.58));
  return Math.round(Math.pow(t, 1.2) * 100);
}

export function rankCandidates(patients: Patient[], queryHash: string): MatchCandidate[] {
  return patients
    // findable=false bloqueia a identificação pública (consentimento do titular)
    .filter((p) => p.photo && p.photoHash && !p.archived && p.findable !== false)
    .map((p) => {
      const distance = hamming(p.photoHash as string, queryHash);
      return { patient: p, distance, confidence: confidenceFromDistance(distance) };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

export function ensurePatientHash(p: Patient): Promise<Patient> {
  if (!p.photo || p.photoHash) return Promise.resolve(p);
  return dHash(p.photo)
    .then((hash) => ({ ...p, photoHash: hash }))
    .catch(() => p);
}

function canvasToDataURL(canvas: HTMLCanvasElement, quality: number): string {
  return canvas.toDataURL('image/jpeg', quality);
}

export async function fileToDataURL(file: File, maxW = 640, quality = 0.85): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(raw);
  const scale = Math.min(1, maxW / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToDataURL(canvas, quality);
}

export function captureVideoFrame(video: HTMLVideoElement, maxW = 640, mirror = true): string {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const scale = Math.min(1, maxW / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToDataURL(canvas, 0.82);
}

export async function makeThumb(src: string, size = 96): Promise<string> {
  try {
    const img = await loadImage(src);
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvasToDataURL(canvas, 0.6);
  } catch {
    return src;
  }
}

/* --------------------------- digital (demo) ---------------------------- */

export function makeFingerprintTemplate(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function qualityFromSamples(samples: { x: number; y: number }[]): number {
  if (samples.length < 2) return 88;
  const mx = samples.reduce((s, p) => s + p.x, 0) / samples.length;
  const my = samples.reduce((s, p) => s + p.y, 0) / samples.length;
  const variance =
    samples.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / samples.length;
  const std = Math.sqrt(variance);
  return Math.max(62, Math.min(97, Math.round(97 - std * 9)));
}

/* ------------------------------ formato -------------------------------- */

export function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function ageFromBirth(iso: string): number | null {
  if (!iso) return null;
  const b = new Date(iso + 'T00:00:00');
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function formatDateBR(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return formatDateBR(new Date(ts).toISOString().slice(0, 10));
}

export function daysSince(isoDate: string): number {
  if (!isoDate) return 0;
  const start = new Date(isoDate + 'T00:00:00').getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000));
}

/* ---------------------- contatos: links de aviso ----------------------- */

export function phoneDigits(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.length > 0 && d.length <= 11) d = '55' + d;
  return d;
}

export function formatPhone(phone: string): string {
  const d = phoneDigits(phone).replace(/^55/, '');
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return phone;
}

export function telLink(phone: string): string {
  return `tel:+${phoneDigits(phone)}`;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
}

export function emergencyAlertText(
  personName: string,
  age: number | null,
  situationLabel: string,
  location: string,
): string {
  const lines = [
    `URGENTE — Alerta do app My Doctor: ${personName}${age !== null ? ` (${age} anos)` : ''} está em situação de emergência/vulnerabilidade (${situationLabel})${location ? ` — ${location}` : ''}.`,
    'Por favor, entre em contato com urgência ou responda para confirmar o recebimento.',
  ];
  return lines.join('\n');
}

export function foundPersonAlertText(personName: string, age: number | null, location: string): string {
  const lines = [
    `Olá! Alerta do app My Doctor: ${personName}${age !== null ? ` (${age} anos)` : ''} acabou de ser ENCONTRADA e identificada pelo app${location ? ` — ${location}` : ''}.`,
    'Por favor, responda com urgência para confirmar o recebimento e combinar os próximos passos.',
  ];
  return lines.join('\n');
}

export function missingAlertText(personName: string, age: number | null, lastPlace: string): string {
  const lines = [
    `Olá! Alerta do app My Doctor: ${personName}${age !== null ? ` (${age} anos)` : ''} foi localizada agora há pouco, identificada pelo app.`,
    lastPlace ? `Último local conhecido antes do desaparecimento: ${lastPlace}.` : '',
    'Por favor, responda para confirmar o recebimento deste aviso.',
  ];
  return lines.filter(Boolean).join('\n');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

const AVATAR_TONES = [
  ['#0f6e4e', '#d8ede1'],
  ['#2f6392', '#dce9f2'],
  ['#a96f12', '#f7e8cc'],
  ['#7a4a9e', '#eadff3'],
  ['#a53a2e', '#f5ded9'],
  ['#1a4233', '#b9ccc0'],
];

export function avatarTone(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = AVATAR_TONES[h % AVATAR_TONES.length];
  return { bg, fg };
}
