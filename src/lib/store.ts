import type { AccessGrant, Account, AppState, ClinicalEntry, IdEvent, Patient } from './types';
import { EMPTY_MISSING } from './types';
import { makeFingerprintTemplate } from './biometrics';

const KEY = 'vitalis.state.v3';

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

/** Hash local simples do PIN (demo — nunca sai do dispositivo). */
export function hashPin(pin: string): string {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = ((h * 33) ^ pin.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(36);
}

/* ------------------- normalização / migração de versão ------------------ */

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeEntry(raw: Record<string, unknown>): ClinicalEntry {
  return {
    id: String(raw.id ?? uid()),
    type: (raw.type as ClinicalEntry['type']) ?? 'observacao',
    title: String(raw.title ?? 'Registro'),
    notes: String(raw.notes ?? ''),
    date: String(raw.date ?? ''),
    createdAt: Number(raw.createdAt ?? Date.now()),
    specialty: String(raw.specialty ?? ''),
    archived: Boolean(raw.archived),
  };
}

function normalizeAccount(raw: Record<string, unknown>): Account {
  return {
    id: String(raw.id ?? uid()),
    name: String(raw.name ?? 'Conta'),
    email: String(raw.email ?? ''),
    role: (raw.role as Account['role']) ?? 'titular',
    pinHash: (raw.pinHash as string | null) ?? null,
    createdAt: Number(raw.createdAt ?? Date.now()),
  };
}

function normalizeGrant(raw: Record<string, unknown>): AccessGrant {
  return {
    id: String(raw.id ?? uid()),
    accountId: String(raw.accountId ?? ''),
    patientId: String(raw.patientId ?? ''),
    grantedByName: String(raw.grantedByName ?? ''),
    level: (raw.level as AccessGrant['level']) ?? 'completo',
    createdAt: Number(raw.createdAt ?? Date.now()),
  };
}

function normalizeLog(raw: Record<string, unknown>): IdEvent {
  return {
    id: String(raw.id ?? uid()),
    method: (raw.method as IdEvent['method']) ?? 'face',
    patientId: (raw.patientId as string | null) ?? null,
    patientName: String(raw.patientName ?? '—'),
    confidence: Number(raw.confidence ?? 0),
    quality: (raw.quality as number | null) ?? null,
    result: (raw.result as IdEvent['result']) ?? 'none',
    at: Number(raw.at ?? Date.now()),
    thumb: (raw.thumb as string | null) ?? null,
    detail: raw.detail !== undefined ? String(raw.detail) : undefined,
    byName: String(raw.byName ?? ''),
  };
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
    entries: asArray<Record<string, unknown>>(raw.entries).map(normalizeEntry),
    createdAt: Number(raw.createdAt ?? Date.now()),
    primarySpecialty: String(raw.primarySpecialty ?? ''),
    archived: Boolean(raw.archived),
    ownerAccountId: (raw.ownerAccountId as string | null) ?? null,
  };
}

export function emptyState(): AppState {
  return {
    rev: 3,
    seeded: false,
    patients: [],
    log: [],
    accounts: [],
    grants: [],
    session: null,
  };
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
        { id: uid(), type: 'consulta', title: 'Avaliação geriátrica — estadiamento cognitivo', notes: 'CDR 1 (demência leve). Mantida Donepezila; orientada a família sobre segurança em saídas.', date: iso(34).slice(0, 10), createdAt: daysAgo(34), specialty: 'Geriatria', archived: false },
        { id: uid(), type: 'exame', title: 'Ressonância magnética do crânio', notes: 'Atrofia hipocampal bilateral compatível com doença de Alzheimer.', date: iso(61).slice(0, 10), createdAt: daysAgo(61), specialty: 'Neurologia', archived: false },
        { id: uid(), type: 'medicacao', title: 'Ajuste de Metformina', notes: 'HbA1c 6,9%. Mantida dose atual, reavaliar em 3 meses.', date: iso(90).slice(0, 10), createdAt: daysAgo(90), specialty: 'Endocrinologia', archived: false },
      ],
      createdAt: daysAgo(420),
      primarySpecialty: 'Geriatria',
      archived: false,
      ownerAccountId: 'acc-ana',
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
        { id: uid(), type: 'procedimento', title: 'Implante de marca-passo definitivo', notes: 'Procedimento sem intercorrências. Repouso relativo por 7 dias.', date: iso(300).slice(0, 10), createdAt: daysAgo(300), specialty: 'Cardiologia', archived: false },
        { id: uid(), type: 'consulta', title: 'Retorno cardiológico', notes: 'Holter 24h sem novas arritmias significativas.', date: iso(45).slice(0, 10), createdAt: daysAgo(45), specialty: 'Cardiologia', archived: false },
      ],
      createdAt: daysAgo(380),
      primarySpecialty: 'Cardiologia',
      archived: false,
      ownerAccountId: 'acc-carlos',
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
        { id: uid(), type: 'vacina', title: 'Tríplice viral — reforço', notes: 'Sem reações adversas.', date: iso(180).slice(0, 10), createdAt: daysAgo(180), specialty: 'Pediatria', archived: false },
        { id: uid(), type: 'consulta', title: 'Pediatria — puericultura', notes: 'Crescimento e desenvolvimento adequados. Prescrita caneta de epinefrina (EpiPen).', date: iso(70).slice(0, 10), createdAt: daysAgo(70), specialty: 'Pediatria', archived: false },
      ],
      createdAt: daysAgo(200),
      primarySpecialty: 'Pediatria',
      archived: false,
      ownerAccountId: 'acc-juliana',
    },
  ];
}

function seedAccounts(): Account[] {
  const pin = hashPin('1234');
  return [
    { id: 'acc-ana', name: 'Ana Beatriz Sampaio', email: 'ana.sampaio@exemplo.com', role: 'titular', pinHash: pin, createdAt: daysAgo(420) },
    { id: 'acc-carlos', name: 'Carlos Eduardo Menezes', email: 'carlos.menezes@exemplo.com', role: 'titular', pinHash: pin, createdAt: daysAgo(380) },
    { id: 'acc-juliana', name: 'Juliana Almeida', email: 'juliana.almeida@exemplo.com', role: 'titular', pinHash: pin, createdAt: daysAgo(200) },
    { id: 'acc-marina', name: 'Marina Sampaio Reis', email: 'marina.reis@exemplo.com', role: 'responsavel', pinHash: pin, createdAt: daysAgo(300) },
  ];
}

function seedGrants(): AccessGrant[] {
  return [
    {
      id: 'g-marina-ana',
      accountId: 'acc-marina',
      patientId: 'p-ana',
      grantedByName: 'Ana Beatriz Sampaio',
      level: 'completo',
      createdAt: daysAgo(280),
    },
  ];
}

export function seedDemoState(current: AppState): AppState {
  const demo = seedPatients();
  const existingIds = new Set(current.patients.map((p) => p.id));
  const merged = [...current.patients, ...demo.filter((p) => !existingIds.has(p.id))];
  const accIds = new Set(current.accounts.map((a) => a.id));
  const accounts = [...current.accounts, ...seedAccounts().filter((a) => !accIds.has(a.id))];
  const gIds = new Set(current.grants.map((g) => g.id));
  const grants = [...current.grants, ...seedGrants().filter((g) => !gIds.has(g.id))];
  return { ...current, seeded: true, patients: merged, accounts, grants };
}

/* ------------------------------- persistência --------------------------- */

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const sessionRaw = (parsed.session ?? null) as AppState['session'];
    return {
      rev: 3,
      seeded: Boolean(parsed.seeded),
      patients: asArray<Record<string, unknown>>(parsed.patients).map(normalizePatient),
      log: asArray<Record<string, unknown>>(parsed.log).map(normalizeLog),
      accounts: asArray<Record<string, unknown>>(parsed.accounts).map(normalizeAccount),
      grants: asArray<Record<string, unknown>>(parsed.grants).map(normalizeGrant),
      session: sessionRaw ? { accountId: String(sessionRaw.accountId), patientId: sessionRaw.patientId ?? null } : null,
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

/* --------------------------- acesso & delegação ------------------------- */

/** Prontuários acessíveis por uma conta: próprios + delegados (não arquivados). */
export function accessiblePatients(state: AppState, accountId: string): Patient[] {
  const granted = new Set(state.grants.filter((g) => g.accountId === accountId).map((g) => g.patientId));
  return state.patients.filter(
    (p) => !p.archived && (p.ownerAccountId === accountId || granted.has(p.id)),
  );
}

export function grantFor(state: AppState, accountId: string, patientId: string): AccessGrant | null {
  return state.grants.find((g) => g.accountId === accountId && g.patientId === patientId) ?? null;
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
    const sessionRaw = (inner.session ?? null) as AppState['session'];
    return {
      rev: 3,
      seeded: true,
      patients: asArray<Record<string, unknown>>(inner.patients).map(normalizePatient),
      log: asArray<Record<string, unknown>>(inner.log).map(normalizeLog),
      accounts: asArray<Record<string, unknown>>(inner.accounts).map(normalizeAccount),
      grants: asArray<Record<string, unknown>>(inner.grants).map(normalizeGrant),
      session: sessionRaw ? { accountId: String(sessionRaw.accountId), patientId: sessionRaw.patientId ?? null } : null,
    };
  } catch {
    return null;
  }
}
