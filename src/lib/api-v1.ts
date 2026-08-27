export type MfaChannel = 'email' | 'sms';

export interface LoginStartResponse {
  challengeId: string;
  channel: MfaChannel;
  destinationMasked: string;
  expiresAt: string;
  developmentCode?: string;
}

export interface V1User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

export interface LoginVerifyResponse {
  token: string;
  user: V1User;
}

export interface PatientProfile {
  id: string;
  record: string;
  name: string;
  relationship: string;
  accessLevel: string;
  source: 'owned' | 'delegated';
  validUntil?: string | null;
}

export interface HealthEventV1 {
  id: string;
  patientId: string;
  type: string;
  status: string;
  title: string;
  occurredAt: string;
  endedAt?: string | null;
  timezone: string;
  practitionerNameSnapshot?: string | null;
  professionSnapshot?: string | null;
  councilSnapshot?: string | null;
  registrationSnapshot?: string | null;
  registrationRegionSnapshot?: string | null;
  organizationNameSnapshot?: string | null;
  locationNameSnapshot?: string | null;
  payload: Record<string, unknown>;
  provenance?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHealthEventInput {
  type: string;
  title: string;
  occurredAt: string;
  endedAt?: string;
  timezone?: string;
  practitionerId?: string;
  practitionerName?: string;
  profession?: string;
  council?: string;
  registration?: string;
  registrationRegion?: string;
  organizationId?: string;
  organizationName?: string;
  locationId?: string;
  locationName?: string;
  sourceSystemId?: string;
  payload?: Record<string, unknown>;
}

export class MyDoctorV1Api {
  constructor(
    private readonly baseUrl: string,
    private token = '',
  ) {}

  setToken(token: string) {
    this.token = token;
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, '')}/api/v1${path}`;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(this.url(path), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let error = `Erro do servidor (${response.status}).`;
      try {
        const body = (await response.json()) as { error?: string };
        if (body.error) error = body.error;
      } catch {
        // resposta sem JSON
      }
      throw new Error(error);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  startPasswordLogin(input: { email: string; password: string; channel: MfaChannel }) {
    return this.req<LoginStartResponse>('/auth/login/start', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  verifyPasswordLogin(input: { challengeId: string; code: string }) {
    return this.req<LoginVerifyResponse>('/auth/login/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listProfiles() {
    return this.req<PatientProfile[]>('/profiles');
  }

  createDependentProfile(input: {
    name: string;
    relationship: 'child' | 'parent' | 'guardian' | 'dependent' | 'other';
    birthDate?: string;
    record?: string;
  }) {
    return this.req<PatientProfile>('/profiles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  listHealthEvents(patientId: string) {
    return this.req<HealthEventV1[]>(`/patients/${encodeURIComponent(patientId)}/events`);
  }

  createHealthEvent(patientId: string, input: CreateHealthEventInput) {
    return this.req<HealthEventV1>(`/patients/${encodeURIComponent(patientId)}/events`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
}

export function defaultV1ApiUrl() {
  return (import.meta.env.VITE_API_URL as string | undefined)?.trim() || 'http://localhost:8787';
}
