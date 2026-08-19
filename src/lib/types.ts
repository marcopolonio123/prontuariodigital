export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

export type Relationship =
  | 'mae' | 'pai' | 'filho' | 'filha' | 'conjuge' | 'irmao' | 'irma'
  | 'responsavel' | 'curador' | 'amigo' | 'medico' | 'outro';

export const RELATIONSHIPS: Relationship[] = [
  'mae', 'pai', 'filho', 'filha', 'conjuge', 'irmao', 'irma',
  'responsavel', 'curador', 'amigo', 'medico', 'outro',
];

export const RELATIONSHIP_META: Record<Relationship, string> = {
  mae: 'Mãe', pai: 'Pai', filho: 'Filho', filha: 'Filha', conjuge: 'Cônjuge',
  irmao: 'Irmão', irma: 'Irmã', responsavel: 'Responsável', curador: 'Curador(a)',
  amigo: 'Amigo(a)', medico: 'Médico(a)', outro: 'Outro',
};

export type SpecialCare =
  | 'alzheimer' | 'autismo' | 'diabetes' | 'epilepsia' | 'cardiaco'
  | 'nao_verbal' | 'mobilidade' | 'outro';

export const SPECIAL_CARE_META: Record<SpecialCare, { label: string; detail: string }> = {
  alzheimer: { label: 'Alzheimer / demência', detail: 'Pode estar confusa(o). Fale com calma, evite discussão e não a(o) deixe sozinha(o).' },
  autismo: { label: 'Autismo (TEA)', detail: 'Evite toque inesperado, barulho e luz forte. Comunicação direta e tranquila.' },
  diabetes: { label: 'Diabetes', detail: 'Em confusão ou tremor, pode ser hipoglicemia: ofereça açúcar se estiver consciente.' },
  epilepsia: { label: 'Epilepsia', detail: 'Em crise: proteja a cabeça, não coloque nada na boca e cronometre a duração.' },
  cardiaco: { label: 'Cardiopatia', detail: 'Em dor no peito ou desmaio, acione o SAMU 192 imediatamente.' },
  nao_verbal: { label: 'Não verbal', detail: 'Comunique-se com gestos simples, calma e contato visual.' },
  mobilidade: { label: 'Mobilidade reduzida', detail: 'Pode usar bengala, andador ou cadeira de rodas.' },
  outro: { label: 'Outro cuidado especial', detail: 'Consulte as instruções específicas no prontuário.' },
};

export const SPECIAL_CARES = Object.keys(SPECIAL_CARE_META) as SpecialCare[];

export const SPECIALTIES: string[] = [
  'Clínica geral', 'Cardiologia', 'Dermatologia', 'Endocrinologia', 'Gastroenterologia',
  'Geriatria', 'Ginecologia e obstetrícia', 'Hematologia', 'Infectologia', 'Nefrologia',
  'Neurologia', 'Nutrição', 'Oncologia', 'Oftalmologia', 'Ortopedia', 'Otorrinolaringologia',
  'Pediatria', 'Psiquiatria', 'Pneumologia', 'Reumatologia', 'Urologia', 'Psicologia',
  'Fisioterapia', 'Fonoaudiologia', 'Odontologia', 'Emergência',
];

export interface Contact {
  id: string;
  name: string;
  relationship: Relationship;
  phone: string;
  priority: 1 | 2 | 3;
  note?: string;
}

export interface Fingerprint {
  template: string;
  quality: number;
  enrolledAt: number;
}

export type EntryType = 'consulta' | 'exame' | 'medicacao' | 'vacina' | 'procedimento' | 'observacao';

export const ENTRY_TYPES: EntryType[] = ['consulta', 'exame', 'medicacao', 'vacina', 'procedimento', 'observacao'];

export const ENTRY_META: Record<EntryType, { label: string; plural: string }> = {
  consulta: { label: 'Consulta', plural: 'Consultas' },
  exame: { label: 'Exame', plural: 'Exames' },
  medicacao: { label: 'Medicação', plural: 'Medicações' },
  vacina: { label: 'Vacina', plural: 'Vacinas' },
  procedimento: { label: 'Procedimento', plural: 'Procedimentos' },
  observacao: { label: 'Observação', plural: 'Observações' },
};

export interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'pdf';
  mime: string;
  sizeKb: number;
  dataUrl: string; // conteúdo local (imagem redimensionada ou PDF)
  addedAt: number;
  addedBy: string; // conta que anexou
}

export interface ClinicalSection {
  text: string; // descritivo (prescrição ou exames solicitados)
  attachments: Attachment[]; // receita/exame anexado (foto, scan ou PDF)
}

export interface ContinuousMed {
  id: string;
  name: string; // princípio ativo / nome comercial
  dose: string; // ex.: 50 mg
  frequency: string; // ex.: 1x ao dia
  reason: string; // motivo (opcional)
}

export interface Insurance {
  id: string;
  operator: string; // operadora (Unimed, Bradesco Saúde…)
  plan: string; // nome do plano
  cardNumber: string; // número da carteirinha / beneficiário
  validUntil: string; // validade (ISO yyyy-mm-dd) ou ''
  image: string | null; // foto da carteirinha (armazenada localmente)
  notes: string;
  addedAt: number;
}

export interface ClinicalEntry {
  id: string;
  type: EntryType;
  title: string;
  notes: string;
  date: string;
  createdAt: number;
  specialty: string;
  archived: boolean;
  prescription: ClinicalSection | null; // prescrição médica (descritiva e/ou receita anexada)
  exams: ClinicalSection | null; // exames solicitados (descritivo e/ou pedido anexado)
}

export type MissingEventKind = 'missing' | 'found' | 'sighting' | 'notified';

export type EmergencySituation =
  | 'acidente'
  | 'internacao'
  | 'desorientada'
  | 'clinica'
  | 'desastre'
  | 'vulneravel'
  | 'violencia'
  | 'outro';

export const EMERGENCY_SITUATIONS: EmergencySituation[] = [
  'acidente',
  'internacao',
  'desorientada',
  'clinica',
  'desastre',
  'vulneravel',
  'violencia',
  'outro',
];

export const EMERGENCY_SITUATION_META: Record<EmergencySituation, { label: string }> = {
  acidente: { label: 'Acidente' },
  internacao: { label: 'Internação sem contato com a família' },
  desorientada: { label: 'Encontrada desorientada' },
  clinica: { label: 'Emergência clínica' },
  desastre: { label: 'Desastre / calamidade' },
  vulneravel: { label: 'Vulnerabilidade social / situação de rua' },
  violencia: { label: 'Vítima de violência / risco' },
  outro: { label: 'Outra situação' },
};

export type EmergencyEventKind = 'emergency' | 'notified' | 'resolved' | 'update';

export interface EmergencyEvent {
  id: string;
  at: number;
  kind: EmergencyEventKind;
  text: string;
}

export interface EmergencyStatus {
  active: boolean;
  since: string; // ISO yyyy-mm-dd
  situation: EmergencySituation | '';
  location: string;
  notes: string;
  history: EmergencyEvent[];
}

export interface MissingEvent {
  id: string;
  at: number;
  kind: MissingEventKind;
  text: string;
}

export interface MissingStatus {
  active: boolean;
  since: string;
  lastPlace: string;
  notes: string;
  history: MissingEvent[];
}

export const EMPTY_MISSING: MissingStatus = { active: false, since: '', lastPlace: '', notes: '', history: [] };

export const EMPTY_EMERGENCY: EmergencyStatus = {
  active: false,
  since: '',
  situation: '',
  location: '',
  notes: '',
  history: [],
};

export interface Patient {
  id: string;
  record: string;
  name: string;
  birthDate: string;
  sex: 'F' | 'M' | 'O';
  cpf: string;
  bloodType: BloodType | '';
  allergies: string[];
  intolerances: string[];
  conditions: string[];
  medications: ContinuousMed[]; // uso contínuo (nome, dose, frequência, motivo)
  insurances: Insurance[]; // convênios / seguros saúde
  specialCare: SpecialCare[];
  emergencyNotes: string;
  contacts: Contact[];
  missing: MissingStatus;
  emergency: EmergencyStatus;
  photo: string | null;
  photoHash: string | null;
  fingerprint: Fingerprint | null;
  entries: ClinicalEntry[];
  createdAt: number;
  primarySpecialty: string;
  archived: boolean;
  ownerAccountId: string | null;
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
  byName: string;
}

export interface Session {
  accountId: string;
  patientId: string | null;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  role: 'titular' | 'responsavel';
  pinHash: string | null;
  createdAt: number;
}

export interface AccessGrant {
  id: string;
  accountId: string;
  patientId: string;
  grantedByName: string;
  level: 'completo' | 'leitura';
  createdAt: number;
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

export type Route =
  | { name: 'identify' }
  | { name: 'patients' }
  | { name: 'record'; id: string }
  | { name: 'missing' }
  | { name: 'consultor' }
  | { name: 'settings' };
