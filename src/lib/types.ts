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
}

export interface Fingerprint {
  template: string;
  enrolledAt: number;
  quality: number;
}

export interface Patient {
  id: string;
  record: string; // ex.: VT-2026-0004
  name: string;
  birthDate: string; // ISO
  sex: 'F' | 'M' | 'O';
  cpf: string;
  bloodType: BloodType | '';
  allergies: string[];
  conditions: string[];
  photo: string | null; // dataURL ou caminho
  photoHash: string | null; // assinatura visual (dHash 64-bit)
  fingerprint: Fingerprint | null;
  entries: ClinicalEntry[];
  createdAt: number;
}

export type IdMethod = 'face' | 'finger';

export type IdResult = 'match' | 'review' | 'none';

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
}

export interface AppState {
  rev: number;
  seeded: boolean;
  patients: Patient[];
  log: IdEvent[];
}

export type Route =
  | { name: 'identify' }
  | { name: 'patients' }
  | { name: 'record'; id: string }
  | { name: 'settings' };

export interface MatchCandidate {
  patient: Patient;
  distance: number;
  confidence: number;
}
