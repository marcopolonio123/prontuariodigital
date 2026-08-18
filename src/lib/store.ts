import type { AppState, ClinicalEntry, Patient } from './types';
import { EMPTY_MISSING } from './types';
import { makeFingerprintTemplate } from './biometrics';

const KEY = 'vitalis.state.v2';

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function newRecordNumber(patients: Patient[]): string {
  const year = new Date().getFullYear();
  const seq = patients.length + 1;
  return `VT-${year}-${String(seq).padStart(4, '0')}`;
}

/* ------------------- normalização / migração de versão ------------------ */

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function normalizePatient(raw: Record<string, unknown>): Patient {
  const missingRaw = (raw.missing ?? null) as Partial<Patient['missing']> | null;
  return {
    id: String(raw.id ?? uid()),
    record: String(raw.record ?? ''),
    name: String(raw.name ?? 'Sem nome'),
    birthDate: String(raw.birthDate ?? ''),
    sex: (raw.sex as Patient['sex']) ?? 'O',
    cpf: String(raw.cpf ?? ''),
    bloodType: (raw.bloodType as Patient['bloodType']) ?? '',
    allergies: asArray<string>(raw.allergies),
    intolerances: asArray<string>(raw.intolerances),
    conditions: asArray<string>(raw.conditions),
    medications: asArray<string>(raw.medications),
    specialCare: asArray<Patient['specialCare'][number]>(raw.specialCare),
    emergencyNotes: String(raw.emergencyNotes ?? ''),
    contacts: asArray<Patient['contacts'][number]>(raw.contacts),
    missing: {
      active: Boolean(missingRaw?.active),
      since: String(missingRaw?.since ?? ''),
      lastPlace: String(missingRaw?.lastPlace ?? ''),
      notes: String(missingRaw?.notes ?? ''),
      history: asArray<Patient['missing']['history'][number]>(missingRaw?.history),
    },
    photo: (raw.photo as string | null) ?? null,
    photoHash: (raw.photoHash as string | null) ?? null,
    fingerprint: (raw.fingerprint as Patient['fingerprint']) ?? null,
    entries: asArray<ClinicalEntry>(raw.entries),
    createdAt: Number(raw.createdAt ?? Date.now()),
  };
}

export function emptyState(): AppState {
  return { rev: 2, seeded: false, patients: [], log: [] };
}

/* ------------------------------- seed demo ------------------------------ */

const now = Date.now();
const daysAgo = (d: number) => now - d * 86_400_000;
const iso = (d: number) => new Date(daysAgo(d)).toISOString();

function seedPatients(): Patient[] {
  return [
    {
      id: 'p-ana',
      record: 'VT-2024-0001',
      name: 'Ana Beatriz Sampaio',
      birthDate: '1951-03-12',
      sex: 'F',
      cpf: '312.445.908-77',
      bloodType: 'O+',
      allergies: ['Penicilina'],
      intolerances: ['Lactose'],
      conditions: ['Hipertensão arterial'],
      medications: ['Donepezila 10 mg — 1x/dia', 'Metformina 850 mg — 2x/dia', 'Losartana 50 mg — 1x/dia'],
      specialCare: ['alzheimer', 'diabetes'],
      emergencyNotes:
        'Pode não reconhecer familiares e repetir perguntas. Fale com calma, use frases curtas e não a deixe sozinha. Usa pulseira de identificação.',
      contacts: [
        { id: 'c-ana-1', name: 'Marina Sampaio Reis', relationship: 'filha', phone: '5511988771201', priority: 1 },
        { id: 'c-ana-2', name: 'Paulo Sampaio', relationship: 'filho', phone: '5511976542210', priority: 2 },
        { id: 'c-ana-3', name: 'Dra. Lígia Fontes', relationship: 'outro', phone: '551132558800', priority: 3, note: 'Geriatra' },
      ],
      missing: {
        active: true,
        since: iso(2).slice(0, 10),
        lastPlace: 'Praça da Matriz, Centro',
        notes: 'Saiu para caminhar por volta das 8h e não retornou. Vestia blusa verde e calça cinza.',
        history: [
          { id: uid(), at: daysAgo(2), kind: 'missing', text: 'Desaparecimento registrado pela família.' },
          { id: uid(), at: daysAgo(1), kind: 'sighting', text: 'Vista próxima à feira livre da Rua das Flores (não confirmado).' },
        ],
      },
      photo: '/portraits/ana.svg',
      photoHash: null,
      fingerprint: { template: makeFingerprintTemplate(), enrolledAt: daysAgo(120), quality: 91 },
      entries: [
        { id: uid(), type: 'consulta', title: 'Avaliação geriátrica — estadiamento cognitivo', notes: 'CDR 1 (demência leve). Mantida Donepezila; orientada a família sobre segurança em saídas.', date: iso(34).slice(0, 10), createdAt: daysAgo(34) },
        { id: uid(), type: 'exame', title: 'Ressonância magnética do crânio', notes: 'Atrofia hipocampal bilateral compatível com doença de Alzheimer.', date: iso(61).slice(0, 10), createdAt: daysAgo(61) },
        { id: uid(), type: 'medicacao', title: 'Ajuste de Metformina', notes: 'HbA1c 6,9%. Mantida dose atual, reavaliar em 3 meses.', date: iso(90).slice(0, 10), createdAt: daysAgo(90) },
      ],
      createdAt: daysAgo(420),
    },
    {
      id: 'p-carlos',
      record: 'VT-2024-0002',
      name: 'Carlos Eduardo Menezes',
      birthDate: '1966-09-02',
      sex: 'M',
      cpf: '198.552.347-10',
      bloodType: 'A-',
      allergies: ['Dipirona'],
      intolerances: ['Glúten (sensibilidade)'],
      conditions: ['Arritmia controlada'],
      medications: ['Amiodarona 200 mg — 1x/dia', 'Rosuvastatina 20 mg — à noite'],
      specialCare: ['cardiaco'],
      emergencyNotes: 'Portador de marca-passo (lado esquerdo do tórax). Em desmaio ou dor no peito, acionar SAMU 192 imediatamente.',
      contacts: [
        { id: 'c-car-1', name: 'Rafael Menezes', relationship: 'filho', phone: '5521996338844', priority: 1 },
        { id: 'c-car-2', name: 'Tereza Menezes', relationship: 'conjuge', phone: '5521988112093', priority: 2 },
      ],
      missing: { ...EMPTY_MISSING },
      photo: '/portraits/carlos.svg',
      photoHash: null,
      fingerprint: { template: makeFingerprintTemplate(), enrolledAt: daysAgo(98), quality: 88 },
      entries: [
        { id: uid(), type: 'procedimento', title: 'Implante de marca-passo definitivo', notes: 'Procedimento sem intercorrências. Repouso relativo por 7 dias.', date: iso(300).slice(0, 10), createdAt: daysAgo(300) },
        { id: uid(), type: 'consulta', title: 'Retorno cardiológico', notes: 'Holter 24h sem novas arritmias significativas.', date: iso(45).slice(0, 10), createdAt: daysAgo(45) },
      ],
      createdAt: daysAgo(380),
    },
    {
      id: 'p-sofia',
      record: 'VT-2025-0003',
      name: 'Sofia Almeida Costa',
      birthDate: '2016-05-21',
      sex: 'F',
      cpf: '',
      bloodType: 'B+',
      allergies: ['Amendoim (anafilaxia)', 'Picada de abelha'],
      intolerances: ['Leite de vaca'],
      conditions: [],
      medications: [],
      specialCare: [],
      emergencyNotes:
        'ALERTA: alergia grave a amendoim. Em reação (inchaço, falta de ar) usar caneta de epinefrina na mochila e chamar SAMU 192.',
      contacts: [
        { id: 'c-sof-1', name: 'Juliana Almeida', relationship: 'mae', phone: '5531991204477', priority: 1 },
        { id: 'c-sof-2', name: 'Bruno Costa', relationship: 'pai', phone: '5531982337761', priority: 2 },
      ],
      missing: { ...EMPTY_MISSING },
      photo: null,
      photoHash: null,
      fingerprint: { template: makeFingerprintTemplate(), enrolledAt: daysAgo(40), quality: 74 },
      entries: [
        { id: uid(), type: 'vacina', title: 'Tríplice viral — reforço', notes: 'Sem reações adversas.', date: iso(180).slice(0, 10), createdAt: daysAgo(180) },
        { id: uid(), type: 'consulta', title: 'Pediatria — puericultura', notes: 'Crescimento e desenvolvimento adequados. Prescrita caneta de epinefrina (EpiPen).', date: iso(70).slice(0, 10), createdAt: daysAgo(70) },
      ],
      createdAt: daysAgo(200),
    },
  ];
}

export function seedDemoState(current: AppState): AppState {
  const demo = seedPatients();
  const existingIds = new Set(current.patients.map((p) => p.id));
  const merged = [...current.patients, ...demo.filter((p) => !existingIds.has(p.id))];
  return { ...current, seeded: true, patients: merged };
}

/* ------------------------------- persistência --------------------------- */

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      rev: 2,
      seeded: Boolean(parsed.seeded),
      patients: asArray<Record<string, unknown>>(parsed.patients).map(normalizePatient),
      log: asArray<AppState['log'][number]>(parsed.log),
    };
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

/* ------------------------------ backup JSON ----------------------------- */

export function exportJSON(state: AppState): string {
  return JSON.stringify(
    { app: 'vitalis', exportedAt: new Date().toISOString(), state },
    null,
    2,
  );
}

export function parseImport(text: string): AppState | null {
  try {
    const parsed = JSON.parse(text) as { state?: Partial<AppState>; patients?: unknown[] };
    const inner = (parsed.state ?? parsed) as Partial<AppState>;
    if (!Array.isArray(inner.patients)) return null;
    return {
      rev: 2,
      seeded: true,
      patients: asArray<Record<string, unknown>>(inner.patients).map(normalizePatient),
      log: asArray<AppState['log'][number]>(inner.log),
    };
  } catch {
    return null;
  }
}
