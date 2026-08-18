export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';

export const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export type EntryType =
  | 'consulta'
  | 'exame'
  | 'medicacao'
  | 'vacina'
  | 'procedimento'
  | 'observacao';

export const ENTRY_META: Record<EntryType, { label: string; plural: string }> = {
  consulta: { label: 'Consulta', plural: 'Consultas' },
  exame: { label: 'Exame', plural: 'Exames' },
  medicacao: { label: 'Medicação', plural: 'Medicações' },
  vacina: { label: 'Vacina', plural: 'Vacinas' },
  procedimento: { label: 'Procedimento', plural: 'Procedimentos' },
  observacao: { label: 'Observação', plural: 'Observações' },
};

export const ENTRY_TYPES = Object.keys(ENTRY_META) as EntryType[];

export interface ClinicalEntry {
  id: string;
  type: EntryType;
  title: string;
  notes: string;
  date: string; // ISO yyyy-mm-dd
  createdAt: number;
  specialty: string; // especialidade do registro
  archived: boolean; // arquivado (nunca excluído)
}

export interface Fingerprint {
  template: string;
  enrolledAt: number;
  quality: number;
}

export type Relationship =
  | 'mae'
  | 'pai'
  | 'filho'
  | 'filha'
  | 'conjuge'
  | 'irmao'
  | 'irma'
  | 'amigo'
  | 'responsavel'
  | 'curador'
  | 'outro';

export const RELATIONSHIP_META: Record<Relationship, string> = {
  mae: 'Mãe',
  pai: 'Pai',
  filho: 'Filho',
  filha: 'Filha',
  conjuge: 'Cônjuge',
  irmao: 'Irmão',
  irma: 'Irmã',
  amigo: 'Amigo(a)',
  responsavel: 'Responsável',
  curador: 'Curador(a)',
  outro: 'Outro',
};

export const RELATIONSHIPS = Object.keys(RELATIONSHIP_META) as Relationship[];

export interface Contact {
  id: string;
  name: string;
  relationship: Relationship;
  phone: string; // somente dígitos
  priority: 1 | 2 | 3;
  note?: string;
}

export type SpecialCare =
  | 'alzheimer'
  | 'autismo'
  | 'diabetes'
  | 'epilepsia'
  | 'cardiaco'
  | 'nao_verbal'
  | 'mobilidade'
  | 'outro';

export const SPECIAL_CARE_META: Record<SpecialCare, { label: string; detail: string }> = {
  alzheimer: { label: 'Alzheimer / demência', detail: 'Pode estar confusa, desorientada ou sem memória recente.' },
  autismo: { label: 'Espectro autista', detail: 'Evite toque repentino, luzes fortes e ambientes barulhentos.' },
  diabetes: { label: 'Diabetes insulino-dependente', detail: 'Risco de hipoglicemia; pode precisar de açúcar ou insulina.' },
  epilepsia: { label: 'Epilepsia', detail: 'Em crise: proteja a cabeça, não contenha os movimentos.' },
  cardiaco: { label: 'Cardiopatia / marca-passo', detail: 'Evite esforço; em mal-estar, acione emergência imediatamente.' },
  nao_verbal: { label: 'Não verbal', detail: 'Comunique-se com gestos simples, calma e contato visual.' },
  mobilidade: { label: 'Mobilidade reduzida', detail: 'Pode usar bengala, andador ou cadeira de rodas.' },
  outro: { label: 'Outro cuidado especial', detail: 'Consulte as instruções específicas abaixo.' },
};

export const SPECIAL_CARES = Object.keys(SPECIAL_CARE_META) as SpecialCare[];

export type MissingEventKind = 'missing' | 'found' | 'sighting' | 'notified';

export interface MissingEvent {
  id: string;
  at: number;
  kind: MissingEventKind;
  text: string;
}

export interface MissingStatus {
  active: boolean;
  since: string; // ISO yyyy-mm-dd
  lastPlace: string;
  notes: string;
  history: MissingEvent[];
}

export const EMPTY_MISSING: MissingStatus = {
  active: false,
  since: '',
  lastPlace: '',
  notes: '',
  history: [],
};

export interface Patient {
  id: string;
  record: string; // ex.: VT-2026-0004
  name: string;
  birthDate: string; // ISO
  sex: 'F' | 'M' | 'O';
  cpf: string;
  bloodType: BloodType | '';
  allergies: string[];
  intolerances: string[]; // intolerâncias alimentares
  conditions: string[];
  medications: string[]; // medicações em uso contínuo
  specialCare: SpecialCare[];
  emergencyNotes: string; // instruções para quem encontrar
  contacts: Contact[]; // rede de aviso (pais, filhos, curadores…)
  missing: MissingStatus;
  photo: string | null; // dataURL ou caminho
  photoHash: string | null; // assinatura visual (dHash 64-bit)
  fingerprint: Fingerprint | null;
  entries: ClinicalEntry[];
  createdAt: number;
  primarySpecialty: string; // especialidade médica principal
  archived: boolean; // dados nunca são excluídos — apenas arquivados
  ownerAccountId: string | null; // titular da conta que criou o prontuário
}

export type IdMethod = 'face' | 'finger';

export type IdResult = 'match' | 'review' | 'none' | 'notify' | 'found';

export interface IdEvent {
  id: string;
  method: IdMethod;
  patientId: string | null;
  patientName: string;
  confidence: number;
  quality: number | null;
  result: IdResult;
  at: number;
  thumb: string | null;
  detail?: string;
  byName: string; // conta logada que realizou a consulta (rastreabilidade)
}

export interface Session {
  accountId: string;
  patientId: string | null; // prontuário ativo escolhido após o login
}

export interface AppState {
  rev: number;
  seeded: boolean;
  patients: Patient[];
  log: IdEvent[];
  accounts: Account[];
  grants: AccessGrant[];
  session: Session | null;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  role: 'titular' | 'responsavel';
  pinHash: string | null; // PIN local (demo) — nunca sai do dispositivo
  createdAt: number;
}

export interface AccessGrant {
  id: string;
  accountId: string; // quem recebe o acesso
  patientId: string; // prontuário acessível
  grantedByName: string; // quem delegou
  level: 'completo' | 'leitura';
  createdAt: number;
}

export const SPECIALTIES: string[] = [
  'Clínica geral',
  'Cardiologia',
  'Dermatologia',
  'Endocrinologia',
  'Gastroenterologia',
  'Geriatria',
  'Ginecologia e obstetrícia',
  'Hematologia',
  'Infectologia',
  'Nefrologia',
  'Neurologia',
  'Nutrição',
  'Oncologia',
  'Oftalmologia',
  'Ortopedia',
  'Otorrinolaringologia',
  'Pediatria',
  'Psiquiatria',
  'Pneumologia',
  'Reumatologia',
  'Urologia',
  'Psicologia',
  'Fisioterapia',
  'Fonoaudiologia',
  'Odontologia',
  'Emergência',
];

export type Route =
  | { name: 'identify' }
  | { name: 'consultor' }
  | { name: 'patients' }
  | { name: 'record'; id: string }
  | { name: 'missing' }
  | { name: 'settings' };

export interface MatchCandidate {
  patient: Patient;
  distance: number;
  confidence: number;
}
