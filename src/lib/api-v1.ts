export type MfaChannel = 'email' | 'sms';

const V1_SESSION_TOKEN_KEY = 'mydoctor.v1.sessionToken';
const V1_SESSION_EVENT = 'mydoctor:v1-session-token';

export function readV1SessionToken() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(V1_SESSION_TOKEN_KEY) ?? '';
}

function publishV1SessionToken(token: string) {
  if (typeof window === 'undefined') return;
  if (token) window.sessionStorage.setItem(V1_SESSION_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(V1_SESSION_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(V1_SESSION_EVENT, { detail: token }));
}

export function subscribeV1SessionToken(listener: (token: string) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail ?? readV1SessionToken());
  window.addEventListener(V1_SESSION_EVENT, handler);
  return () => window.removeEventListener(V1_SESSION_EVENT, handler);
}

export interface LoginStartResponse { challengeId: string; channel: MfaChannel; destinationMasked: string; expiresAt: string; developmentCode?: string; }
export interface FingerprintReferenceMetadata {registeredAt:string;width:number;height:number;finger:'right_index'|'left_index';status:'pending_engine'}
export interface FingerprintReferenceInput {photo:string;consent:true;finger:'right_index'|'left_index'}
export interface AccountProfileV1 extends V1User { motherName?:string; fingerprintReference?:FingerprintReferenceMetadata|null; rgUf: string; rgType: 'RG' | 'CIN'; avatarDataUrl: string; cpf: string; rg: string; postalCode: string; street: string; number: string; complement: string; neighborhood: string; country: string; birthDate: string; sex: string; city: string; state: string; completed: boolean; isHealthProfessional: boolean; }
export interface VerificationDocumentV1 { id: string; kind: string; filename: string; mimeType: string; sizeBytes: number; createdAt: string; }
export interface V1User { id: string; name: string; email: string; phone?: string | null; isHealthProfessional?: boolean; }
export interface RegisterResponse extends V1User { requiresMfaLogin: true; }
export interface LoginVerifyResponse { token: string; user: V1User; }
export interface PatientProfile { id: string; record: string; name: string; relationship: string; accessLevel: string; source: 'owned' | 'delegated'; validUntil?: string | null; isTutor?:boolean;hasTutor?:boolean; }
export interface ProfessionalRegistrationV1 { id: string; council: string; councilName: string; registration: string; region?: string | null; status: string; verifiedAt?: string | null; }
export interface ProfessionalProfileV1 { id: string; name: string; profession: string; specialty?: string | null; verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected' | 'suspended' | string; verifiedAt?: string | null; active: boolean; registrations: ProfessionalRegistrationV1[]; }
export interface UpsertProfessionalProfileInput { profession: string; specialty?: string; council: 'CRM' | 'CREFITO' | 'CRN' | 'COREN' | 'CRO' | 'OUTROS'; registration: string; region?: string; }

export interface PatientLookupV1 { patientId: string; name: string; }
export interface ProfessionalAccessRequestV1 {
  id: string;
  patientId: string;
  patientName: string;
  status: string;
  requestedPermission?: string;
  requestedScope?: unknown;
  requestedAt: string;
  expiresAt?: string | null;
  decidedAt?: string | null;
  grantId?: string | null;
  grantValidUntil?: string | null;
  grantRevokedAt?: string | null;
}
export interface IncomingAccessRequestV1 {
  id: string;
  patientId: string;
  patientName: string;
  requesterName: string;
  practitionerName: string;
  profession?: string | null;
  specialty?: string | null;
  registrations: Array<{ council: string; registration: string; region?: string | null; status: string }>;
  requestedPermission: string;
  requestedScope: unknown;
  status: string;
  requestedAt: string;
  expiresAt?: string | null;
  grantId?: string | null;
  grantValidUntil?: string | null;
  grantRevokedAt?: string | null;
}

export interface LocationAddressV1 {postalCode:string;street:string;number:string;complement:string;neighborhood:string;city:string;state:string;country:string}
export interface LocationAvailabilityV1 {weekday:number;start:string;end:string}
export interface ProfessionalLocationV1 { id: string; name: string; address: string; fullAddress?:LocationAddressV1|null; availability?:LocationAvailabilityV1[];active?:boolean;hasAssociations?:boolean; }

export interface ProfessionalConsultationDetailV1 extends HealthEventV1 { patientName: string; editable: boolean; canSubmit: boolean; documents: Array<{ id: string; type: string; originalFilename: string }>; }

export interface ProfessionalConsultationV1 {
  updatedAt: string;
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  occurredAt: string;
  status: 'pending_patient_confirmation' | 'final' | 'rejected_by_patient' | string;
  createdAt: string;
}

export interface IncomingConsultationV1 {
  homeVisit?: boolean; onlineVisit?: boolean;
  updatedAt?: string;
  documents?: Array<{ id: string; originalFilename: string }>;
  clinical?: Record<string, string>;
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  occurredAt: string;
  organizationName?: string | null;
  profession?: string | null;
  practitionerName: string;
  council?: string | null;
  registration?: string | null;
  region?: string | null;
  notes?: string;
  createdAt: string;
}

export interface ClinicalSummaryV1 {
  record: Record<string, unknown>;
  events: Array<HealthEventV1 & { documents: Array<{ id: string; type: string; originalFilename: string }> }>;
  schedules: Array<{ id: string; name: string; dose: string; weekdays: number[]; times: string[]; timezone: string; continuousUse: boolean; startsOn: string; endsOn: string | null; createdAt: string }>;
}
export interface HealthEventV1 {
  id: string; patientId: string; type: string; status: string; title: string; occurredAt: string; endedAt?: string | null; timezone: string;
  practitionerNameSnapshot?: string | null; professionSnapshot?: string | null; councilSnapshot?: string | null; registrationSnapshot?: string | null;
  registrationRegionSnapshot?: string | null; organizationNameSnapshot?: string | null; locationNameSnapshot?: string | null;
  payload: Record<string, unknown>; provenance?: Record<string, unknown> | null; createdAt: string; updatedAt: string;
}

export interface CreateHealthEventInput {
  type: string; title: string; occurredAt: string; endedAt?: string; timezone?: string; practitionerId?: string; practitionerName?: string;
  profession?: string; council?: string; registration?: string; registrationRegion?: string; organizationId?: string; organizationName?: string; homeVisit?: boolean; onlineVisit?: boolean;
  locationId?: string; locationName?: string; sourceSystemId?: string; payload?: Record<string, unknown>;
}

export interface ConsultantUsageV1 {
  limit: number; windowHours: number; used: number; pending: number; remaining: number;
  nextAvailableAt: string | null; configured: boolean;
  countingRule: 'answered_messages'; scope: 'account'; renewal: 'rolling';
}

export interface MedicationScheduleV1 {
  id: string; patientId: string; name: string; dose: string; weekdays: number[]; times: string[];
  continuousUse?: boolean; timezone: string; startsOn: string; endsOn: string | null; recipientIds: string[];
  alertsEnabled: boolean; active: boolean; updatedAt: string;
}
export type MedicationScheduleInput = Pick<MedicationScheduleV1, 'name' | 'dose' | 'weekdays' | 'times' | 'timezone' | 'continuousUse' | 'startsOn' | 'endsOn' | 'recipientIds' | 'alertsEnabled'>;
export interface MedicationAgendaV1 {
  registeredMedications?: Array<{ name: string; dose: string; frequency: string }>;
  schedules: MedicationScheduleV1[]; alertsEnabled: boolean; canEdit: boolean; deliveryAvailable: boolean;
  recipients: Array<{ id: string; name: string; emailMasked: string; owner: boolean }>;
}

export interface AdminProfessionalV1 {
  id: string; name: string; email: string; profession: string; specialty: string | null;
  verificationStatus: string; active: boolean; updatedAt: string;
  registrations: Array<{ id: string; council: string; registration: string; region: string | null; status: string }>;
  documents: VerificationDocumentV1[];
  history: Array<{ id: string; decision: string; status: string; actorName: string; note: string; evidence: string | null; createdAt: string }>;
}
export interface UtilityLocation {status:string;latitude?:number;longitude?:number;accuracy?:number}
export interface UtilityPhotoDiagnostic {width:number;height:number;brightness:number;sharpness:number}
export type UtilityPhotoAction='camera_opened'|'camera_failed'|'photo_captured'|'photo_discarded'|'photo_failed';
export interface UtilityLog {id:string;at:string;method:string;result:string;patientName:string|null;byName:string;location:UtilityLocation;diagnostic?:UtilityPhotoDiagnostic|null}
export interface PersonV1 {id?:string;name:string;cpf:string;birthDate:string;motherName:string;rg:string;rgUf:string;sex:string;phone:string;postalCode:string;street:string;number:string;complement:string;neighborhood:string;city:string;state:string;country:string;avatarDataUrl:string;canEdit?:boolean;isTutor?:boolean;hasTutor?:boolean;}
export interface PersonCandidate {id:string;name:string;record:string;document:string;hasTutor:boolean;archived:boolean;token:string;}
export interface TutorRequestV1 {id:string;patientId:string;patientName:string;record:string;requesterName:string;requesterUserId:string;status:string;kind:string;reason:string;note:string;relationship:string;createdAt:string;canDecide:boolean;mine:boolean;documents:VerificationDocumentV1[];}
export interface TutorHistoryV1 {id:string;action:string;at:string;actorName:string;oldTutorName:string;newTutorName:string;}
export class MyDoctorV1Api {
  recordUtilityUsage(method:'open'|'finger'|'finger_photo',location:UtilityLocation,action?:UtilityPhotoAction,diagnostic?:UtilityPhotoDiagnostic){return this.req<{id:string;at:string;result:string}>('/utility/usage',{method:'POST',body:JSON.stringify({method,location,action,diagnostic})})}
  utilityLogs(query:{admin?:boolean;mine?:boolean;identificationOnly?:boolean;patientId?:string;cursor?:string}={}){const params=new URLSearchParams();if(query.admin)params.set('admin','1');if(query.mine)params.set('mine','1');if(query.identificationOnly)params.set('identificationOnly','1');if(query.patientId)params.set('patientId',query.patientId);if(query.cursor)params.set('cursor',query.cursor);return this.req<{items:UtilityLog[];nextCursor:string|null}>('/utility/logs?'+params)}

  constructor(private readonly baseUrl: string, private token = readV1SessionToken()) {}

  searchPeople(input:{cpf:string;name:string;birthDate:string;motherName:string;record?:string}){return this.req<{items:PersonCandidate[];more:boolean;creationToken:string|null}>('/people/search',{method:'POST',body:JSON.stringify(input)})}
  createPerson(input:PersonV1,relationship:string,creationToken:string){return this.req<PatientProfile>('/profiles',{method:'POST',body:JSON.stringify({...input,relationship,creationToken})})}
  getPerson(id:string){return this.req<PersonV1>('/people/'+encodeURIComponent(id))}
  savePerson(id:string,input:PersonV1){return this.req<{id:string;name:string}>('/people/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify(input)})}
  getPersonDocument(id:string){return this.req<VerificationDocumentV1|null>('/people/'+encodeURIComponent(id)+'/document')}
  getTutorHistory(id:string){return this.req<TutorHistoryV1[]>('/people/'+encodeURIComponent(id)+'/tutorship-history')}
  listTutorRequests(admin=false){return this.req<TutorRequestV1[]>((admin?'/admin':'')+'/tutorship/requests')}
  requestTutorship(input:{token:string;kind:string;relationship:string;reason:string}){return this.req<{id:string;status:string}>('/tutorship/requests',{method:'POST',body:JSON.stringify(input)})}
  decideTutorship(id:string,decision:string,note:string,admin=false){return this.req((admin?'/admin':'')+'/tutorship/requests/'+encodeURIComponent(id)+'/decision',{method:'POST',body:JSON.stringify({decision,note,checkedDocuments:admin&&decision==='approve'})})}
  cancelTutorship(id:string){return this.req('/tutorship/requests/'+encodeURIComponent(id)+'/cancel',{method:'POST'})}
  submitTutorship(id:string){return this.req('/tutorship/requests/'+encodeURIComponent(id)+'/submit',{method:'POST'})}
  endTutorship(id:string){return this.req('/people/'+encodeURIComponent(id)+'/end-tutorship',{method:'POST',body:JSON.stringify({confirm:true})})}
  private async uploadPersonFile(path:string,kind:string,file:File){if(file.size>3*1024*1024)throw Error('Cada documento pode ter até 3 MB.');const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file)});return this.req<VerificationDocumentV1>(path,{method:'POST',body:JSON.stringify({kind,filename:file.name,mimeType:file.type,data})})}
  savePersonDocument(id:string,kind:string,file:File){return this.uploadPersonFile('/people/'+encodeURIComponent(id)+'/document',kind,file)}
  uploadTutorDocument(id:string,kind:string,file:File){return this.uploadPersonFile('/tutorship/requests/'+encodeURIComponent(id)+'/documents',kind,file)}
  async openPersonFile(id:string,admin=false,person=false){const path=person?'/people/'+encodeURIComponent(id)+'/document/download':(admin?'/admin':'')+'/tutorship/documents/'+encodeURIComponent(id);const response=await fetch(this.url(path),{headers:{Authorization:'Bearer '+this.token}});if(!response.ok)throw Error('Não foi possível abrir o documento.');const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
  lookupAddress(cep: string, signal?: AbortSignal) { return this.req<{ erro?: boolean | string; logradouro?: string; bairro?: string; localidade?: string; uf?: string; cep?: string }>(`/address/cep/${encodeURIComponent(cep)}`, { signal }); }
  getAccount() { return this.req<AccountProfileV1>('/account'); }
  saveAccount(input: { name: string; phone: string; birthDate: string; sex: string; city: string; state: string; isHealthProfessional: boolean; motherName?:string;cpf?: string; rg?: string; rgUf?: string; rgType?: 'RG' | 'CIN'; postalCode?: string; street?: string; number?: string; complement?: string; neighborhood?: string; country?: string; avatarDataUrl?: string;fingerprintReference?:FingerprintReferenceInput|null }) { return this.req<AccountProfileV1>('/account', { method: 'PUT', body: JSON.stringify(input) }); }
  getIdentityDocument() { return this.req<VerificationDocumentV1 | null>('/account/document'); }
  async saveIdentityDocument(kind: string, file: File, expectedId: string | null) {
    if (file.size > 3 * 1024 * 1024) throw new Error('Cada documento pode ter até 3 MB.');
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    return this.req<VerificationDocumentV1>('/account/document', { method: 'POST', body: JSON.stringify({ kind, filename: file.name, mimeType: file.type, data, expectedId }) });
  }
  removeIdentityDocument(id: string) { return this.req<{ ok: boolean }>(`/account/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  listVerificationDocuments() { return this.req<VerificationDocumentV1[]>('/professional/documents'); }
  async uploadVerificationDocument(kind: string, file: File) {
    if (file.size > 3 * 1024 * 1024) throw new Error('Cada documento pode ter até 3 MB.');
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
    return this.req<VerificationDocumentV1>('/professional/documents', { method: 'POST', body: JSON.stringify({ kind, filename: file.name, mimeType: file.type, data }) });
  }
  removeVerificationDocument(id: string) { if (id.startsWith('account:')) return this.removeIdentityDocument(id.slice(8)); return this.req<{ ok: boolean }>(`/professional/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  async openVerificationDocument(id: string, admin = false) {
    const path = id.startsWith('account:') ? `${admin ? '/admin/account' : '/account'}/documents/${encodeURIComponent(id.slice(8))}/download` : `${admin ? '/admin' : '/professional'}/documents/${encodeURIComponent(id)}/download`;
    const response = await fetch(this.url(path), { headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error('Não foi possível abrir o documento.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  getAdminSession() { return this.req<{ authorized: boolean }>('/admin/session'); }
  listAdminProfessionals() { return this.req<AdminProfessionalV1[]>('/admin/professionals'); }
  decideProfessional(id: string, input: { decision: string; note: string; evidence: string; registrationId: string; checkedIdentityAndCouncil: boolean; expectedUpdatedAt: string }) {
    return this.req<{ status: string }>(`/admin/professionals/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify(input) });
  }
  setToken(token: string) { this.token = token; publishV1SessionToken(token); }
  private url(path: string) { return `${this.baseUrl.replace(/\/$/, '')}/api/v1${path}`; }
  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.url(path), { ...init, headers: { 'Content-Type': 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(init.headers ?? {}) } });
    if (!response.ok) {
      let error = `Erro do servidor (${response.status}).`;
      try { const body = (await response.json()) as { error?: string }; if (body.error) error = body.error; } catch { /* resposta sem JSON */ }
      throw new Error(error);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  register(input: { name: string; email: string; password: string; phone?: string; isHealthProfessional?: boolean }) { return this.req<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }); }
  startPasswordLogin(input: { email: string; password: string; channel: MfaChannel }) { return this.req<LoginStartResponse>('/auth/login/start', { method: 'POST', body: JSON.stringify(input) }); }
  verifyPasswordLogin(input: { challengeId: string; code: string }) { return this.req<LoginVerifyResponse>('/auth/login/verify', { method: 'POST', body: JSON.stringify(input) }); }
  lookupPractitioner(council:string,registration:string,region:string){return this.req<{id:string;name:string;specialty:string|null;profession:string}|null>('/practitioners/lookup?'+new URLSearchParams({council,registration,region}))}
  listPractitionerLocations(id:string){return this.req<Array<{id:string;name:string;address:string}>>('/practitioners/'+encodeURIComponent(id)+'/locations')}
  getProfessionalProfile() { return this.req<ProfessionalProfileV1 | null>('/professional/profile'); }
  saveProfessionalProfile(input: UpsertProfessionalProfileInput) { return this.req<ProfessionalProfileV1>('/professional/profile', { method: 'PUT', body: JSON.stringify(input) }); }

  lookupPatientByEmail(email: string) { return this.req<PatientLookupV1 | null>(`/professional/patients/lookup?email=${encodeURIComponent(email)}`); }
  listProfessionalAccessRequests() { return this.req<ProfessionalAccessRequestV1[]>('/professional/access-requests'); }
  requestPatientAccess(patientId: string) { return this.req<ProfessionalAccessRequestV1>('/professional/access-requests', { method: 'POST', body: JSON.stringify({ patientId }) }); }
  listIncomingAccessRequests() { return this.req<IncomingAccessRequestV1[]>('/access-requests/incoming'); }
  decideAccessRequest(id: string, decision: 'approve' | 'reject', note?: string, duration?: 'indefinite' | 'until', validUntil?: string) { return this.req<{ id: string; status: string; decidedAt?: string | null; grantId?: string; validUntil?: string | null }>(`/access-requests/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision, note, duration, validUntil }) }); }

  listProfessionalLocations(includeInactive=false) { return this.req<ProfessionalLocationV1[]>('/professional/locations'+(includeInactive?'?includeInactive=1':'')); }
  setProfessionalLocationActive(id:string,active:boolean){return this.req<ProfessionalLocationV1>('/professional/locations/'+encodeURIComponent(id)+'/status',{method:'PATCH',body:JSON.stringify({active})})}
  createProfessionalLocation(input: { name: string; address: string;fullAddress?:LocationAddressV1|null;availability?:LocationAvailabilityV1[] }) { return this.req<ProfessionalLocationV1>('/professional/locations', { method: 'POST', body: JSON.stringify(input) }); }
  updateProfessionalLocation(id: string, input: { name: string; address: string;fullAddress?:LocationAddressV1|null;availability?:LocationAvailabilityV1[] }) { return this.req<ProfessionalLocationV1>(`/professional/locations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }); }
  removeProfessionalLocation(id: string) { return this.req<{removed:boolean}>(`/professional/locations/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  listProfessionalConsultations() { return this.req<ProfessionalConsultationV1[]>('/professional/consultations'); }
  revokePatientAccess(id: string) { return this.req<{ status: string }>(`/access-requests/${encodeURIComponent(id)}/revoke`, { method: 'POST' }); }
  getClinicalSummary(patientId: string) { return this.req<ClinicalSummaryV1>(`/professional/patients/${encodeURIComponent(patientId)}/summary`); }
  searchAgendaPatients(name:string) {return this.req<{items:Array<{id:string;name:string;record:string;documentType:string;documentNumber:string}>;total:number}>('/professional/agenda/patients?q='+encodeURIComponent(name))}
  getProfessionalAgenda() {return this.req<Array<{id:string;title:string;at:string;notes:string;patientName:string|null;patientId?:string;source:string;status:string;alert:boolean;updatedAt:string;locationId?:string;locationName?:string;locationAddress?:string}>>('/professional/agenda')}
  saveProfessionalAgenda(input:Record<string,unknown>) {return this.req('/professional/agenda',{method:'POST',body:JSON.stringify(input)})}
  createProfessionalConsultation(input: { followUp?:unknown;accessRequestId: string; title: string; occurredAt: string; timezone?: string; type?: string; organizationName?: string; homeVisit?: boolean; onlineVisit?: boolean; symptoms?: string; diagnosis?: string; exams?: string; prescriptions?: string; notes?: string }) {
    return this.req<HealthEventV1>('/professional/consultations', { method: 'POST', body: JSON.stringify(input) });
  }
  getProfessionalConsultation(id: string) { return this.req<ProfessionalConsultationDetailV1>(`/professional/consultations/${encodeURIComponent(id)}`); }
  updateProfessionalConsultation(id: string, input: { followUp?:unknown;title: string; type: string; occurredAt: string; organizationName: string; homeVisit?: boolean; onlineVisit?: boolean; symptoms: string; diagnosis: string; exams: string; prescriptions: string; notes: string; expectedUpdatedAt: string }) { return this.req<HealthEventV1>(`/professional/consultations/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }); }
  submitProfessionalConsultation(id: string, expectedUpdatedAt: string) { return this.req<{ id: string; status: string }>(`/professional/consultations/${encodeURIComponent(id)}/submit`, { method: 'POST', body: JSON.stringify({ expectedUpdatedAt }) }); }
  removeProfessionalConsultationDocument(id: string, documentId: string) { return this.req<{ status: string }>(`/professional/consultations/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/inactivate`, { method: 'POST' }); }
  listIncomingConsultations() { return this.req<IncomingConsultationV1[]>('/consultations/incoming'); }
  decideConsultation(id: string, decision: 'confirm' | 'reject', expectedUpdatedAt?: string) {
    return this.req<{ id: string; status: string }>(`/consultations/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision, expectedUpdatedAt }) });
  }

  async getConsultantRecord(patientId: string): Promise<Record<string, unknown> | null> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/patients`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!response.ok) throw new Error('Não foi possível consultar a ficha do prontuário.');
    const patients: unknown = await response.json();
    if (!Array.isArray(patients)) throw new Error('Resposta inválida do prontuário.');
    return patients.find(patient => patient?.id === patientId) ?? null;
  }

  listProfiles() { return this.req<PatientProfile[]>('/profiles'); }
  createDependentProfile(input: { name: string; relationship: 'child' | 'parent' | 'guardian' | 'dependent' | 'other'; birthDate?: string; sex?: string; record?: string; }) { return this.req<PatientProfile>('/profiles', { method: 'POST', body: JSON.stringify(input) }); }
  listHealthEvents(patientId: string) { return this.req<HealthEventV1[]>(`/patients/${encodeURIComponent(patientId)}/events`); }
  createHealthEvent(patientId: string, input: CreateHealthEventInput) { return this.req<HealthEventV1>(`/patients/${encodeURIComponent(patientId)}/events`, { method: 'POST', body: JSON.stringify(input) }); }
  updateHealthEvent(patientId: string, eventId: string, input: CreateHealthEventInput) { return this.req<HealthEventV1>(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: JSON.stringify(input) }); }
  getMedicationAgenda(patientId: string) { return this.req<MedicationAgendaV1>(`/patients/${encodeURIComponent(patientId)}/medications`); }
  saveMedicationSchedule(patientId: string, input: MedicationScheduleInput, schedule?: MedicationScheduleV1) {
    return this.req<MedicationScheduleV1>(`/patients/${encodeURIComponent(patientId)}/medications${schedule ? '/' + encodeURIComponent(schedule.id) : ''}`, {
      method: schedule ? 'PUT' : 'POST', body: JSON.stringify({ ...input, ...(schedule ? { expectedUpdatedAt: schedule.updatedAt } : {}) }),
    });
  }
  setMedicationAlerts(patientId: string, enabled: boolean) { return this.req<{ alertsEnabled: boolean }>(`/patients/${encodeURIComponent(patientId)}/medications/alerts`, { method: 'PUT', body: JSON.stringify({ enabled }) }); }
  removeMedicationSchedule(patientId: string, scheduleId: string) { return this.req<{ ok: boolean }>(`/patients/${encodeURIComponent(patientId)}/medications/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' }); }

  getConsultantUsage() { return this.req<ConsultantUsageV1>('/consultant/usage'); }
  askConsultant(patientId: string, question: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, consent: boolean, images: string[] = []) { return this.req<{ answer: string; usage: ConsultantUsageV1 }>(`/patients/${encodeURIComponent(patientId)}/consultant`, { method: 'POST', body: JSON.stringify({ question, messages, consent, images }) }); }
  deleteDiaryEntry(patientId: string, eventId: string, entryIndex: number, expectedAt: string, expectedText: string) { return this.req<{ ok: boolean }>(`/patients/${encodeURIComponent(patientId)}/diary/${encodeURIComponent(eventId)}/entries/${entryIndex}`, { method: 'DELETE', body: JSON.stringify({ expectedAt, expectedText }) }); }
  inactivateHealthEvent(patientId: string, eventId: string, reason: string) { return this.req<HealthEventV1>(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}/inactivate`, { method: 'POST', body: JSON.stringify({ reason }) }); }
  reactivateHealthEvent(patientId: string, eventId: string) { return this.req<HealthEventV1>(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}/reactivate`, { method: 'POST' }); }

  async uploadHealthEventDocuments(patientId: string, eventId: string, category: 'report' | 'prescription' | 'exam', files: File[]) {
    const form = new FormData();
    form.append('category', category);
    files.forEach((file) => form.append('files', file));
    const response = await fetch(this.url(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}/documents`), {
      method: 'POST', headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}, body: form,
    });
    if (!response.ok) {
      let error = `Erro do servidor (${response.status}).`;
      try { const body = await response.json() as { error?: string }; if (body.error) error = body.error; } catch {}
      throw new Error(error);
    }
    return await response.json() as Array<{ id: string; type: string; originalFilename: string; mimeType: string; sizeBytes: number; status: string }>;
  }
  listHealthEventDocuments(patientId: string, eventId: string) { return this.req<Array<{ id: string; type: string; originalFilename: string; mimeType: string; sizeBytes: number; status: string }>>(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}/documents`); }

  async openHealthEventDocument(patientId: string, eventId: string, documentId: string, filename: string) {
    const response = await fetch(this.url(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}/documents/${encodeURIComponent(documentId)}/download`), {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (!response.ok) throw new Error(`Não foi possível abrir ${filename}.`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
  inactivateHealthEventDocument(patientId: string, eventId: string, documentId: string) { return this.req<{ id: string; status: string }>(`/patients/${encodeURIComponent(patientId)}/events/${encodeURIComponent(eventId)}/documents/${encodeURIComponent(documentId)}/inactivate`, { method: 'POST' }); }

}

export function defaultV1ApiUrl() {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (import.meta.env.DEV) return 'http://localhost:8787';
  return window.location.origin;
}



