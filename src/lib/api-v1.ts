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
export interface V1User { id: string; name: string; email: string; phone?: string | null; }
export interface RegisterResponse extends V1User { requiresMfaLogin: true; }
export interface LoginVerifyResponse { token: string; user: V1User; }
export interface PatientProfile { id: string; record: string; name: string; relationship: string; accessLevel: string; source: 'owned' | 'delegated'; validUntil?: string | null; }
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
}

export interface ProfessionalConsultationV1 {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  occurredAt: string;
  status: 'pending_patient_confirmation' | 'final' | 'rejected_by_patient' | string;
  createdAt: string;
}

export interface IncomingConsultationV1 {
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

export interface HealthEventV1 {
  id: string; patientId: string; type: string; status: string; title: string; occurredAt: string; endedAt?: string | null; timezone: string;
  practitionerNameSnapshot?: string | null; professionSnapshot?: string | null; councilSnapshot?: string | null; registrationSnapshot?: string | null;
  registrationRegionSnapshot?: string | null; organizationNameSnapshot?: string | null; locationNameSnapshot?: string | null;
  payload: Record<string, unknown>; provenance?: Record<string, unknown> | null; createdAt: string; updatedAt: string;
}

export interface CreateHealthEventInput {
  type: string; title: string; occurredAt: string; endedAt?: string; timezone?: string; practitionerId?: string; practitionerName?: string;
  profession?: string; council?: string; registration?: string; registrationRegion?: string; organizationId?: string; organizationName?: string;
  locationId?: string; locationName?: string; sourceSystemId?: string; payload?: Record<string, unknown>;
}

export class MyDoctorV1Api {
  constructor(private readonly baseUrl: string, private token = readV1SessionToken()) {}

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

  register(input: { name: string; email: string; password: string; phone?: string }) { return this.req<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) }); }
  startPasswordLogin(input: { email: string; password: string; channel: MfaChannel }) { return this.req<LoginStartResponse>('/auth/login/start', { method: 'POST', body: JSON.stringify(input) }); }
  verifyPasswordLogin(input: { challengeId: string; code: string }) { return this.req<LoginVerifyResponse>('/auth/login/verify', { method: 'POST', body: JSON.stringify(input) }); }
  getProfessionalProfile() { return this.req<ProfessionalProfileV1 | null>('/professional/profile'); }
  saveProfessionalProfile(input: UpsertProfessionalProfileInput) { return this.req<ProfessionalProfileV1>('/professional/profile', { method: 'PUT', body: JSON.stringify(input) }); }

  lookupPatientByEmail(email: string) { return this.req<PatientLookupV1 | null>(`/professional/patients/lookup?email=${encodeURIComponent(email)}`); }
  listProfessionalAccessRequests() { return this.req<ProfessionalAccessRequestV1[]>('/professional/access-requests'); }
  requestPatientAccess(patientId: string) { return this.req<ProfessionalAccessRequestV1>('/professional/access-requests', { method: 'POST', body: JSON.stringify({ patientId }) }); }
  listIncomingAccessRequests() { return this.req<IncomingAccessRequestV1[]>('/access-requests/incoming'); }
  decideAccessRequest(id: string, decision: 'approve' | 'reject', note?: string) { return this.req<{ id: string; status: string; decidedAt?: string | null; grantId?: string; validUntil?: string | null }>(`/access-requests/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) }); }

  listProfessionalConsultations() { return this.req<ProfessionalConsultationV1[]>('/professional/consultations'); }
  createProfessionalConsultation(input: { accessRequestId: string; title: string; occurredAt: string; organizationName?: string; notes?: string }) {
    return this.req<HealthEventV1>('/professional/consultations', { method: 'POST', body: JSON.stringify(input) });
  }
  listIncomingConsultations() { return this.req<IncomingConsultationV1[]>('/consultations/incoming'); }
  decideConsultation(id: string, decision: 'confirm' | 'reject') {
    return this.req<{ id: string; status: string }>(`/consultations/${encodeURIComponent(id)}/decision`, { method: 'POST', body: JSON.stringify({ decision }) });
  }

  listProfiles() { return this.req<PatientProfile[]>('/profiles'); }
  createDependentProfile(input: { name: string; relationship: 'child' | 'parent' | 'guardian' | 'dependent' | 'other'; birthDate?: string; sex?: string; record?: string; }) { return this.req<PatientProfile>('/profiles', { method: 'POST', body: JSON.stringify(input) }); }
  listHealthEvents(patientId: string) { return this.req<HealthEventV1[]>(`/patients/${encodeURIComponent(patientId)}/events`); }
  createHealthEvent(patientId: string, input: CreateHealthEventInput) { return this.req<HealthEventV1>(`/patients/${encodeURIComponent(patientId)}/events`, { method: 'POST', body: JSON.stringify(input) }); }
}

export function defaultV1ApiUrl() {
  const configured = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (configured) return configured;
  if (import.meta.env.DEV) return 'http://localhost:8787';
  return window.location.origin;
}
