import type { AccessGrant, Account, AppState, ClinicalEntry, IdEvent, Patient, VitalSample } from './types';
import { EMPTY_EMERGENCY, EMPTY_MISSING } from './types';
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

export function hashPin(pin: string): string {
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = ((h * 33) ^ pin.charCodeAt(i)) >>> 0;
  return 'h' + h.toString(36);
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeSection(raw: unknown): ClinicalEntry['prescription'] {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const text = String(s.text ?? '');
  const attachments = asArray<Record<string, unknown>>(s.attachments).map((a) => ({
    id: String(a.id ?? uid()),
    name: String(a.name ?? 'anexo'),
    kind: (a.kind === 'pdf' ? 'pdf' : 'image') as 'pdf' | 'image',
    mime: String(a.mime ?? ''),
    sizeKb: Number(a.sizeKb ?? 0),
    dataUrl: String(a.dataUrl ?? ''),
    addedAt: Number(a.addedAt ?? Date.now()),
    addedBy: String(a.addedBy ?? ''),
  }));
  if (!text && attachments.length === 0) return null;
  return { text, attachments };
}

function normalizeVital(raw: Record<string, unknown>): VitalSample {
  return {
    id: String(raw.id ?? uid()),
    metric: (raw.metric as VitalSample['metric']) ?? 'heart',
    value: Number(raw.value ?? 0),
    at: Number(raw.at ?? Date.now()),
    source: (raw.source as VitalSample['source']) ?? 'manual',
    note: raw.note !== undefined ? String(raw.note) : undefined,
  };
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
    prescription: normalizeSection(raw.prescription),
    exams: normalizeSection(raw.exams),
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
    medications: asArray<unknown>(raw.medications).map((m) => {
      // migração: strings antigas → medicamento estruturado
      if (typeof m === 'string') {
        const [name, ...rest] = m.split('—');
        return { id: uid(), name: name.trim(), dose: '', frequency: rest.join('—').trim(), reason: '' };
      }
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        id: String(r.id ?? uid()),
        name: String(r.name ?? ''),
        dose: String(r.dose ?? ''),
        frequency: String(r.frequency ?? ''),
        reason: String(r.reason ?? ''),
      };
    }),
    insurances: asArray<Record<string, unknown>>(raw.insurances).map((r) => ({
      id: String(r.id ?? uid()),
      operator: String(r.operator ?? ''),
      plan: String(r.plan ?? ''),
      cardNumber: String(r.cardNumber ?? ''),
      validUntil: String(r.validUntil ?? ''),
      image: (r.image as string | null) ?? null,
      notes: String(r.notes ?? ''),
      addedAt: Number(r.addedAt ?? Date.now()),
    })),
    specialCare: asArray<Patient['specialCare'][number]>(raw.specialCare),
    emergencyNotes: String(raw.emergencyNotes ?? ''),
    contacts: asArray<Patient['contacts'][number]>(raw.contacts),
    missing: {
      active: Boolean(missingRaw?.active),
      since: String(missingRaw?.since ?? ''),
      lastPlace: String(missingRaw?.lastPlace ?? ''),
      notes: String(missingRaw?.notes ?? ''),
      history: asArray<Patient['missing']['history'][number]>(missingRaw?.history),
      attachments: asArray<Patient['missing']['attachments'][number]>(missingRaw?.attachments),
    },
    emergency: (() => {
      const emRaw = (raw.emergency ?? null) as Partial<Patient['emergency']> | null;
      return {
        active: Boolean(emRaw?.active),
        since: String(emRaw?.since ?? ''),
        situation: (emRaw?.situation as Patient['emergency']['situation']) ?? '',
        location: String(emRaw?.location ?? ''),
        notes: String(emRaw?.notes ?? ''),
        history: asArray<Patient['emergency']['history'][number]>(emRaw?.history),
        attachments: asArray<Patient['emergency']['attachments'][number]>(emRaw?.attachments),
      };
    })(),
    photo: (raw.photo as string | null) ?? null,
    photoHash: (raw.photoHash as string | null) ?? null,
    fingerprint: (raw.fingerprint as Patient['fingerprint']) ?? null,
    entries: asArray<Record<string, unknown>>(raw.entries).map(normalizeEntry),
    vitals: asArray<Record<string, unknown>>(raw.vitals).map(normalizeVital),
    createdAt: Number(raw.createdAt ?? Date.now()),
    primarySpecialty: String(raw.primarySpecialty ?? ''),
    archived: Boolean(raw.archived),
    ownerAccountId: (raw.ownerAccountId as string | null) ?? null,
    findable: raw.findable === undefined ? true : Boolean(raw.findable),
  };
}

function normalizeCloud(raw: unknown): AppState['cloud'] {
  const r = (raw ?? {}) as Partial<AppState['cloud']>;
  const mode = r.mode === 'demo' || r.mode === 'server' ? r.mode : 'off';
  return {
    mode,
    baseUrl: String(r.baseUrl ?? ''),
    token: String(r.token ?? ''),
    userId: String(r.userId ?? ''),
    userName: String(r.userName ?? ''),
    userEmail: String(r.userEmail ?? ''),
    connectedAt: Number(r.connectedAt ?? 0),
    lastSyncAt: Number(r.lastSyncAt ?? 0),
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
    lgpdConsentedAt: null,
    cloud: normalizeCloud(null),
  };
}

const now = Date.now();
const daysAgo = (d: number) => now - d * 86_400_000;
const iso = (d: number) => new Date(daysAgo(d)).toISOString();
const ahead = (d: number) => new Date(now + d * 86_400_000).toISOString().slice(0, 10);

/** amostra de sinal vital para o seed */
function V(
  metric: VitalSample['metric'],
  value: number,
  d: number,
  source: VitalSample['source'] = 'manual',
  note?: string,
): VitalSample {
  return { id: uid(), metric, value, at: daysAgo(d) + Math.floor(Math.random() * 6) * 3_600_000, source, note };
}

/** registro clínico com campos de prescrição/exames padronizados */
function E(
  base: Omit<ClinicalEntry, 'id' | 'createdAt' | 'archived' | 'prescription' | 'exams'> & {
    agoDays: number;
    prescription?: ClinicalEntry['prescription'];
    exams?: ClinicalEntry['exams'];
  },
): ClinicalEntry {
  const { agoDays, prescription = null, exams = null, ...rest } = base;
  return { ...rest, id: uid(), createdAt: daysAgo(agoDays), archived: false, prescription, exams };
}

function seedPatients(): Patient[] {
  return [
    {
      id: 'p-ana', record: 'VT-2024-0001', name: 'Ana Beatriz Sampaio', birthDate: '1951-03-12', sex: 'F',
      cpf: '312.445.908-77', bloodType: 'O+',
      allergies: ['Penicilina'], intolerances: ['Lactose'], conditions: ['Hipertensão arterial'],
      medications: [
        { id: 'm-ana-1', name: 'Donepezila', dose: '10 mg', frequency: '1x ao dia, pela manhã', reason: 'Doença de Alzheimer' },
        { id: 'm-ana-2', name: 'Metformina', dose: '850 mg', frequency: '2x ao dia, com refeições', reason: 'Diabetes tipo 2' },
        { id: 'm-ana-3', name: 'Losartana', dose: '50 mg', frequency: '1x ao dia', reason: 'Hipertensão arterial' },
      ],
      insurances: [
        { id: 'ins-ana-1', operator: 'Unimed BH', plan: 'Unipart Enfermaria', cardNumber: '0834 5521 7790 02', validUntil: ahead(320), image: null, notes: 'Titular da carteirinha: a própria Ana.', addedAt: daysAgo(210) },
      ],
      specialCare: ['alzheimer', 'diabetes'],
      emergencyNotes: 'Pode não reconhecer familiares e repetir perguntas. Fale com calma, use frases curtas e não a deixe sozinha. Usa pulseira de identificação.',
      contacts: [
        { id: 'c-ana-1', name: 'Marina Sampaio Reis', relationship: 'filha', phone: '5511988771201', priority: 1 },
        { id: 'c-ana-2', name: 'Paulo Sampaio', relationship: 'filho', phone: '5511976542210', priority: 2 },
        { id: 'c-ana-3', name: 'Dra. Lígia Fontes', relationship: 'outro', phone: '551132558800', priority: 3, note: 'Geriatra' },
      ],
      missing: {
        active: true, since: iso(2).slice(0, 10), lastPlace: 'Praça da Matriz, Centro',
        notes: 'Saiu para caminhar por volta das 8h e não retornou. Vestia blusa verde e calça cinza.',
        history: [
          { id: uid(), at: daysAgo(2), kind: 'missing', text: 'Desaparecimento registrado pela família.' },
          { id: uid(), at: daysAgo(1), kind: 'sighting', text: 'Vista próxima à feira livre da Rua das Flores (não confirmado).' },
        ],
        attachments: [
          {
            id: 'att-ana-ref',
            name: 'retrato-de-referencia.svg',
            kind: 'image',
            mime: 'image/svg+xml',
            sizeKb: 9,
            dataUrl: '/portraits/ana.svg',
            addedAt: daysAgo(2),
            addedBy: 'Marina Sampaio Reis',
          },
        ],
      },
      emergency: { ...EMPTY_EMERGENCY },
      photo: '/portraits/ana.svg', photoHash: null,
      fingerprint: { template: makeFingerprintTemplate(), enrolledAt: daysAgo(120), quality: 91 },
      vitals: [
        V('glucose', 96, 7, 'manual', 'jejum'),
        V('glucose', 152, 5, 'manual', 'pós-almoço'),
        V('glucose', 118, 1, 'monitor'),
        V('weight', 68.4, 7, 'manual'),
        V('heart', 78, 2, 'monitor'),
        V('heart', 84, 1, 'monitor'),
        V('systolic', 134, 1, 'monitor'),
        V('diastolic', 86, 1, 'monitor'),
        V('spo2', 96, 1, 'monitor'),
        V('temp', 36.6, 1, 'monitor'),
      ],
      entries: [
        E({
          agoDays: 34, type: 'consulta', title: 'Avaliação geriátrica — estadiamento cognitivo',
          notes: 'CDR 1 (demência leve). Mantida Donepezila; orientada a família sobre segurança em saídas.',
          date: iso(34).slice(0, 10), specialty: 'Geriatria',
          prescription: {
            text: 'Donepezila 10 mg — 1 comprimido à noite\nMetformina 850 mg — 1 comprimido 2x/dia (café e jantar)\nLosartana 50 mg — 1 comprimido pela manhã\nRetorno em 90 dias com a cuidadora.',
            attachments: [],
          },
          exams: {
            text: 'Hemograma completo, HbA1c, creatinina e TSH — colher em jejum de 8h.',
            attachments: [],
          },
        }),
        E({
          agoDays: 61, type: 'exame', title: 'Ressonância magnética do crânio',
          notes: 'Atrofia hipocampal bilateral compatível com doença de Alzheimer.',
          date: iso(61).slice(0, 10), specialty: 'Neurologia',
        }),
        E({
          agoDays: 90, type: 'medicacao', title: 'Ajuste de Metformina',
          notes: 'HbA1c 6,9%. Mantida dose atual, reavaliar em 3 meses.',
          date: iso(90).slice(0, 10), specialty: 'Endocrinologia',
        }),
      ],
      createdAt: daysAgo(420), primarySpecialty: 'Geriatria', archived: false, ownerAccountId: 'acc-ana', findable: true,
    },
    {
      id: 'p-carlos', record: 'VT-2024-0002', name: 'Carlos Eduardo Menezes', birthDate: '1966-09-02', sex: 'M',
      cpf: '198.552.347-10', bloodType: 'A-',
      allergies: ['Dipirona'], intolerances: ['Glúten (sensibilidade)'], conditions: ['Arritmia controlada'],
      medications: [
        { id: 'm-car-1', name: 'Amiodarona', dose: '200 mg', frequency: '1x ao dia', reason: 'Arritmia controlada' },
        { id: 'm-car-2', name: 'Rosuvastatina', dose: '20 mg', frequency: 'à noite', reason: 'Colesterol' },
      ],
      insurances: [
        { id: 'ins-car-1', operator: 'Bradesco Saúde', plan: 'Nacional Flex', cardNumber: '77120 4455 9023 8', validUntil: ahead(140), image: null, notes: 'Dependente: Tereza Menezes (esposa).', addedAt: daysAgo(300) },
      ],
      specialCare: ['cardiaco'],
      emergencyNotes: 'Portador de marca-passo (lado esquerdo do tórax). Em desmaio ou dor no peito, acionar SAMU 192 imediatamente.',
      contacts: [
        { id: 'c-car-1', name: 'Rafael Menezes', relationship: 'filho', phone: '5521996338844', priority: 1 },
        { id: 'c-car-2', name: 'Tereza Menezes', relationship: 'conjuge', phone: '5521988112093', priority: 2 },
      ],
      missing: { ...EMPTY_MISSING },
      emergency: {
        active: true,
        since: iso(1).slice(0, 10),
        situation: 'internacao',
        location: 'Hospital São Lucas — Emergência, leito 12',
        notes: 'Admitido após acidente de trânsito. Sedado, sem condições de se identificar. Reconhecido pelo app My Doctor; equipe acionou a rede de avisos.',
        history: [
          { id: uid(), at: daysAgo(1), kind: 'emergency', text: 'Emergência registrada pelo serviço social do hospital.' },
          { id: uid(), at: daysAgo(1) + 3_600_000, kind: 'notified', text: 'Avisos enviados via app para: Rafael Menezes.' },
        ],
        attachments: [
          {
            id: 'att-car-ref',
            name: 'retrato-de-referencia.svg',
            kind: 'image',
            mime: 'image/svg+xml',
            sizeKb: 9,
            dataUrl: '/portraits/carlos.svg',
            addedAt: daysAgo(1),
            addedBy: 'Serviço social — Hospital São Lucas',
          },
        ],
      },
      photo: '/portraits/carlos.svg', photoHash: null,
      fingerprint: { template: makeFingerprintTemplate(), enrolledAt: daysAgo(98), quality: 88 },
      vitals: [
        V('heart', 62, 3, 'monitor'),
        V('heart', 58, 1, 'monitor'),
        V('systolic', 122, 1, 'monitor'),
        V('diastolic', 78, 1, 'monitor'),
        V('spo2', 95, 1, 'monitor'),
        V('temp', 36.2, 1, 'monitor'),
        V('weight', 84.1, 6, 'manual'),
      ],
      entries: [
        E({
          agoDays: 300, type: 'procedimento', title: 'Implante de marca-passo definitivo',
          notes: 'Procedimento sem intercorrências. Repouso relativo por 7 dias.',
          date: iso(300).slice(0, 10), specialty: 'Cardiologia',
          prescription: {
            text: 'Amiodarona 200 mg — 1x/dia\nRosuvastatina 20 mg — à noite\nCefalexina 500 mg — 6/6h por 7 dias (profilaxia)\nCurativo diário; retirar pontos em 10 dias.',
            attachments: [],
          },
        }),
        E({
          agoDays: 45, type: 'consulta', title: 'Retorno cardiológico',
          notes: 'Holter 24h sem novas arritmias significativas.',
          date: iso(45).slice(0, 10), specialty: 'Cardiologia',
          exams: { text: 'Ecocardiograma transtorácico + Holter 24h para o próximo retorno.', attachments: [] },
        }),
      ],
      createdAt: daysAgo(380), primarySpecialty: 'Cardiologia', archived: false, ownerAccountId: 'acc-carlos', findable: true,
    },
    {
      id: 'p-sofia', record: 'VT-2025-0003', name: 'Sofia Almeida Costa', birthDate: '2016-05-21', sex: 'F',
      cpf: '', bloodType: 'B+',
      allergies: ['Amendoim (anafilaxia)', 'Picada de abelha'], intolerances: ['Leite de vaca'],
      conditions: [],
      medications: [
        { id: 'm-sof-1', name: 'Desloratadina xarope', dose: '2,5 ml', frequency: '1x ao dia, se crises de rinite', reason: 'Rinite alérgica' },
      ],
      insurances: [
        { id: 'ins-sof-1', operator: 'SulAmérica', plan: 'Clássico 100', cardNumber: '90233 1187 4402 5', validUntil: ahead(410), image: null, notes: 'Dependente no plano da mãe (Juliana Almeida).', addedAt: daysAgo(180) },
      ],
      specialCare: [],
      emergencyNotes: 'ALERTA: alergia grave a amendoim. Em reação (inchaço, falta de ar) usar caneta de epinefrina na mochila e chamar SAMU 192.',
      contacts: [
        { id: 'c-sof-1', name: 'Juliana Almeida', relationship: 'mae', phone: '5531991204477', priority: 1 },
        { id: 'c-sof-2', name: 'Bruno Costa', relationship: 'pai', phone: '5531982337761', priority: 2 },
      ],
      missing: { ...EMPTY_MISSING },
      emergency: { ...EMPTY_EMERGENCY },
      photo: null, photoHash: null,
      fingerprint: { template: makeFingerprintTemplate(), enrolledAt: daysAgo(40), quality: 74 },
      vitals: [
        V('weight', 24.8, 10, 'manual', 'consulta pediátrica'),
        V('heart', 92, 10, 'manual'),
        V('temp', 36.8, 10, 'manual'),
      ],
      entries: [
        E({
          agoDays: 180, type: 'vacina', title: 'Tríplice viral — reforço',
          notes: 'Sem reações adversas.', date: iso(180).slice(0, 10), specialty: 'Pediatria',
        }),
        E({
          agoDays: 70, type: 'consulta', title: 'Pediatria — puericultura',
          notes: 'Crescimento e desenvolvimento adequados.',
          date: iso(70).slice(0, 10), specialty: 'Pediatria',
          prescription: {
            text: 'Caneta de epinefrina 0,15 mg (EpiPen Jr) — portar sempre na mochila da escola.\nDesloratadina xarope 2,5 ml — 1x/dia, por 10 dias, se crises de rinite.',
            attachments: [],
          },
          exams: { text: 'IgE específica para amendoim e leite (rast) — repetir em 6 meses.', attachments: [] },
        }),
      ],
      createdAt: daysAgo(200), primarySpecialty: 'Pediatria', archived: false, ownerAccountId: 'acc-juliana', findable: false,
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
    { id: 'g-marina-ana', accountId: 'acc-marina', patientId: 'p-ana', grantedByName: 'Ana Beatriz Sampaio', level: 'completo', createdAt: daysAgo(280) },
    { id: 'g-juliana-sofia', accountId: 'acc-juliana', patientId: 'p-sofia', grantedByName: 'Sistema (guardiã legal)', level: 'completo', createdAt: daysAgo(200) },
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
      lgpdConsentedAt:
        typeof (parsed as Partial<AppState>).lgpdConsentedAt === 'number'
          ? ((parsed as Partial<AppState>).lgpdConsentedAt as number)
          : null,
      cloud: normalizeCloud((parsed as Partial<AppState>).cloud),
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

export function accessiblePatients(state: AppState, accountId: string): Patient[] {
  const granted = new Set(state.grants.filter((g) => g.accountId === accountId).map((g) => g.patientId));
  return state.patients.filter((p) => !p.archived && (p.ownerAccountId === accountId || granted.has(p.id)));
}

export function grantFor(state: AppState, accountId: string, patientId: string): AccessGrant | null {
  return state.grants.find((g) => g.accountId === accountId && g.patientId === patientId) ?? null;
}

export function exportJSON(state: AppState): string {
  return JSON.stringify({ app: 'mydoctor', exportedAt: new Date().toISOString(), state }, null, 2);
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
      lgpdConsentedAt:
        typeof inner.lgpdConsentedAt === 'number' ? (inner.lgpdConsentedAt as number) : null,
      cloud: normalizeCloud(inner.cloud),
    };
  } catch {
    return null;
  }
}
