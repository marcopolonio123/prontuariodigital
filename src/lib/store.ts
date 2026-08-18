import type { AppState, ClinicalEntry, IdEvent, Patient } from './types';
import { makeFingerprintTemplate } from './biometrics';

const KEY = 'vitalis.state.v1';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyState(): AppState {
  return { rev: 1, seeded: false, patients: [], log: [] };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.patients) || !Array.isArray(parsed.log)) {
      return emptyState();
    }
    return { rev: 1, seeded: !!parsed.seeded, patients: parsed.patients, log: parsed.log };
  } catch {
    return emptyState();
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function nextRecordNumber(patients: Patient[]): string {
  const year = new Date().getFullYear();
  let max = 0;
  for (const p of patients) {
    const m = /^VT-(\d{4})-(\d{4})$/.exec(p.record);
    if (m && Number(m[1]) === year) max = Math.max(max, Number(m[2]));
  }
  return `VT-${year}-${String(max + 1).padStart(4, '0')}`;
}

function entry(type: ClinicalEntry['type'], title: string, notes: string, date: string): ClinicalEntry {
  return { id: uid(), type, title, notes, date, createdAt: Date.now() };
}

export function seedDemoState(existing: AppState): AppState {
  if (existing.seeded) return existing;
  const year = new Date().getFullYear();
  const now = Date.now();

  const ana: Patient = {
    id: uid(),
    record: `VT-${year}-0001`,
    name: 'Ana Beatriz Rocha',
    birthDate: '1991-04-12',
    sex: 'F',
    cpf: '412.658.930-05',
    bloodType: 'O+',
    allergies: ['Dipirona'],
    conditions: ['Rinite alérgica'],
    photo: '/portraits/ana.svg',
    photoHash: null,
    fingerprint: { template: makeFingerprintTemplate(), enrolledAt: now - 86400000 * 12, quality: 96 },
    entries: [
      entry('consulta', 'Consulta de rotina', 'Paciente assintomática. PA 118x76, FC 72 bpm. Solicitado hemograma e TSH.', '2026-01-18'),
      entry('vacina', 'Reforço dT (difteria e tétano)', 'Dose de reforço aplicada no deltoide direito. Sem reações adversas.', '2025-11-03'),
      entry('medicacao', 'Desloratadina 5 mg', 'Uso contínuo, 1 comprimido ao dia para controle da rinite.', '2025-09-22'),
    ],
    createdAt: now - 86400000 * 40,
  };

  const carlos: Patient = {
    id: uid(),
    record: `VT-${year}-0002`,
    name: 'Carlos Eduardo Menezes',
    birthDate: '1967-08-30',
    sex: 'M',
    cpf: '187.402.556-91',
    bloodType: 'A-',
    allergies: ['Penicilina'],
    conditions: ['Hipertensão arterial sistêmica'],
    photo: '/portraits/carlos.svg',
    photoHash: null,
    fingerprint: { template: makeFingerprintTemplate(), enrolledAt: now - 86400000 * 12, quality: 93 },
    entries: [
      entry('exame', 'Perfil lipídico + ECG', 'LDL 142 mg/dL (alvo < 100). ECG: ritmo sinusal, sem alterações isquêmicas.', '2026-02-02'),
      entry('consulta', 'Retorno com cardiologia', 'Ajuste de dose do anti-hipertensivo. Reavaliação em 90 dias.', '2026-02-02'),
      entry('medicacao', 'Losartana 50 mg', '1 comprimido 2x ao dia. Monitorar pressão domiciliar.', '2025-06-14'),
    ],
    createdAt: now - 86400000 * 38,
  };

  const helena: Patient = {
    id: uid(),
    record: `VT-${year}-0003`,
    name: 'Helena Duarte Vidal',
    birthDate: '2018-05-21',
    sex: 'F',
    cpf: '',
    bloodType: 'B+',
    allergies: [],
    conditions: ['Asma intermitente leve'],
    photo: null,
    photoHash: null,
    fingerprint: { template: makeFingerprintTemplate(), enrolledAt: now - 86400000 * 6, quality: 89 },
    entries: [
      entry('consulta', 'Consulta pediátrica', 'Crescimento adequado (P50). Ausculta com sibilos esparsos após esforço.', '2025-12-09'),
      entry('observacao', 'Plano de ação na escola', 'Broncodilatador disponível na enfermaria; avisar responsável em crises.', '2025-12-09'),
      entry('vacina', 'Tríplice viral — reforço', 'Reforço aplicado. Carteira de vacinação atualizada.', '2024-03-10'),
    ],
    createdAt: now - 86400000 * 20,
  };

  const log: IdEvent[] = [
    {
      id: uid(),
      method: 'face',
      patientId: ana.id,
      patientName: ana.name,
      confidence: 100,
      quality: null,
      result: 'match',
      at: now - 3600000 * 5,
      thumb: ana.photo,
    },
    {
      id: uid(),
      method: 'finger',
      patientId: carlos.id,
      patientName: carlos.name,
      confidence: 96,
      quality: 93,
      result: 'match',
      at: now - 86400000,
      thumb: null,
    },
  ];

  return {
    rev: 1,
    seeded: true,
    patients: [...existing.patients, ana, carlos, helena],
    log: [...log, ...existing.log].slice(0, 60),
  };
}

export function exportJSON(state: AppState): string {
  return JSON.stringify(
    { app: 'vitalis', exportedAt: new Date().toISOString(), state },
    null,
    2,
  );
}

export function parseImport(text: string): AppState | null {
  try {
    const data = JSON.parse(text) as { state?: AppState };
    const candidate = (data.state ?? data) as AppState;
    if (!candidate || !Array.isArray(candidate.patients) || !Array.isArray(candidate.log)) {
      return null;
    }
    return {
      rev: 1,
      seeded: !!candidate.seeded,
      patients: candidate.patients,
      log: candidate.log,
    };
  } catch {
    return null;
  }
}
