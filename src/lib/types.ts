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

export interface Contact { id: string; name: string; relationship: Relationship; phone: string; priority: 1 | 2 | 3; note?: string; }
export interface Fingerprint { template: string; quality: number; enrolledAt: number; }
export type EntryType = 'consulta' | 'exame' | 'medicacao' | 'vacina' | 'procedimento' | 'observacao';
export const ENTRY_TYPES: EntryType[] = ['consulta', 'exame', 'medicacao', 'vacina', 'procedimento', 'observacao'];
export const ENTRY_META: Record<EntryType, { label: string; plural: string }> = {
  consulta: { label: 'Consulta', plural: 'Consultas' }, exame: { label: 'Exame', plural: 'Exames' },
  medicacao: { label: 'Medicação', plural: 'Medicações' }, vacina: { label: 'Vacina', plural: 'Vacinas' },
  procedimento: { label: 'Procedimento', plural: 'Procedimentos' }, observacao: { label: 'Observação', plural: 'Observações' },
};
export interface Attachment { id: string; name: string; kind: 'image' | 'pdf'; mime: string; sizeKb: number; dataUrl: string; addedAt: number; addedBy: string; }
export interface ClinicalSection { text: string; attachments: Attachment[]; }
export interface ClinicalExam { id: string; name: string; description: string; attachments: Attachment[]; }
export interface ContinuousMed { id: string; name: string; dose: string; frequency: string; reason: string; }
export type InsuranceHolder = 'titular' | 'dependente';
export type InsuranceCoverage = 'empresarial' | 'particular' | 'familiar';
export const INSURANCE_HOLDER_META: Record<InsuranceHolder, string> = { titular: 'Titular', dependente: 'Dependente' };
export const INSURANCE_COVERAGE_META: Record<InsuranceCoverage, string> = { empresarial: 'Empresarial', particular: 'Particular / individual', familiar: 'Familiar' };
export interface Insurance { id: string; operator: string; plan: string; cardNumber: string; validUntil: string; image: string | null; notes: string; holder: InsuranceHolder; coverage: InsuranceCoverage; addedAt: number; }
export interface ClinicalEntry { id: string; type: EntryType; title: string; notes: string; date: string; time?: string; createdAt: number; specialty: string; institution?: string; professionalId?: string; archived: boolean; prescription: ClinicalSection | null; exams: ClinicalExam[] | null; }
export type MissingEventKind = 'missing' | 'found' | 'sighting' | 'notified';
export type EmergencySituation = 'acidente' | 'internacao' | 'desorientada' | 'clinica' | 'desastre' | 'vulneravel' | 'violencia' | 'outro';
export const EMERGENCY_SITUATIONS: EmergencySituation[] = ['acidente','internacao','desorientada','clinica','desastre','vulneravel','violencia','outro'];
export const EMERGENCY_SITUATION_META: Record<EmergencySituation, { label: string }> = {
  acidente:{label:'Acidente'}, internacao:{label:'Internação sem contato com a família'}, desorientada:{label:'Encontrada desorientada'}, clinica:{label:'Emergência clínica'}, desastre:{label:'Desastre / calamidade'}, vulneravel:{label:'Vulnerabilidade social / situação de rua'}, violencia:{label:'Vítima de violência / risco'}, outro:{label:'Outra situação'}
};
export type EmergencyEventKind = 'emergency' | 'notified' | 'resolved' | 'update';
export interface EmergencyEvent { id:string; at:number; kind:EmergencyEventKind; text:string; }
export interface EmergencyStatus { active:boolean; since:string; situation:EmergencySituation|''; location:string; notes:string; history:EmergencyEvent[]; attachments:Attachment[]; }
export interface MissingEvent { id:string; at:number; kind:MissingEventKind; text:string; }
export interface MissingStatus { active:boolean; since:string; lastPlace:string; notes:string; history:MissingEvent[]; attachments:Attachment[]; }
export const EMPTY_MISSING: MissingStatus = { active:false, since:'', lastPlace:'', notes:'', history:[], attachments:[] };
export const EMPTY_EMERGENCY: EmergencyStatus = { active:false, since:'', situation:'', location:'', notes:'', history:[], attachments:[] };
export interface Patient {
  id:string; record:string; name:string; birthDate:string; sex:'F'|'M'|'O'; cpf:string; bloodType:BloodType|''; allergies:string[]; intolerances:string[]; conditions:string[]; medications:ContinuousMed[]; insurances:Insurance[]; specialCare:SpecialCare[]; emergencyNotes:string; contacts:Contact[]; missing:MissingStatus; emergency:EmergencyStatus; photo:string|null; photoHash:string|null; fingerprint:Fingerprint|null; entries:ClinicalEntry[]; vitals:VitalSample[]; createdAt:number; primarySpecialty:string; archived:boolean; ownerAccountId:string|null; findable:boolean;
}
export type IdMethod='face'|'finger'; export type IdResult='match'|'review'|'none'|'notify'|'found';
export interface GeoStamp { lat:number; lng:number; accuracy:number; label?:string; }
export interface IdEvent { id:string; method:IdMethod; patientId:string|null; patientName:string; confidence:number; quality:number|null; result:IdResult; at:number; thumb:string|null; detail?:string; byName:string; geo?:GeoStamp|null; geoDenied?:boolean; }
export interface Session { accountId:string; patientId:string|null; }
export interface Account { id:string; name:string; email:string; role:'titular'|'responsavel'; pinHash:string|null; createdAt:number; }
export interface AccessGrant { id:string; accountId:string; patientId:string; grantedByName:string; level:'completo'|'leitura'; createdAt:number; }
export type VitalMetric='heart'|'systolic'|'diastolic'|'spo2'|'temp'|'glucose'|'respiratory'|'weight';
export type VitalSource='manual'|'monitor'|'healthconnect'|'healthkit';
export interface VitalSample { id:string; metric:VitalMetric; value:number; at:number; source:VitalSource; note?:string; }
export interface AppState { rev:number; seeded:boolean; patients:Patient[]; log:IdEvent[]; accounts:Account[]; grants:AccessGrant[]; session:Session|null; lgpdConsentedAt:number|null; cloud:CloudState; }
export type CloudMode='off'|'demo'|'server';
export interface CloudState { mode:CloudMode; baseUrl:string; token:string; userId:string; userName:string; userEmail:string; connectedAt:number; lastSyncAt:number; }
export const EMPTY_CLOUD:CloudState={mode:'off',baseUrl:'',token:'',userId:'',userName:'',userEmail:'',connectedAt:0,lastSyncAt:0};
export interface CloudUser { id:string; name:string; email:string; }
export type Route =
  | { name:'patients' }
  | { name:'record'; id:string }
  | { name:'missing' }
  | { name:'consultor' }
  | { name:'vitals' }
  | { name:'insurance' }
  | { name:'cloud' }
  | { name:'settings' };
