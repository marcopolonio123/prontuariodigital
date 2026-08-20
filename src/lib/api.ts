import type { CloudState, CloudUser, IdEvent, Patient } from './types';
import { newRecordNumber } from './store';

/* ------------------------------------------------------------------ */
/* Contrato da API Vitalis — implementado pelo servidor real           */
/* (server/src/index.ts) e pelo servidor de demonstração embutido.     */
/* ------------------------------------------------------------------ */

export interface VitalisApi {
  health(): Promise<{ ok: boolean; version: string; engine: string }>;
  register(input: { name: string; email: string; password: string }): Promise<{ token: string; user: CloudUser }>;
  login(input: { email: string; password: string }): Promise<{ token: string; user: CloudUser }>;
  listPatients(): Promise<Patient[]>;
  upsertPatient(p: Patient): Promise<Patient>;
  listLogs(): Promise<IdEvent[]>;
  pushLog(e: IdEvent): Promise<void>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/* ------------------------- cliente HTTP real --------------------------- */

export class HttpApi implements VitalisApi {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private url(path: string) {
    return this.baseUrl.replace(/\/$/, '') + path;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.url(path), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new ApiError('Servidor inacessível — verifique a URL, o HTTPS e a conexão.');
    }
    if (res.status === 401) throw new ApiError('Sessão expirada ou credenciais inválidas.', 401);
    if (!res.ok) {
      let msg = `Erro do servidor (${res.status}).`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {
        /* corpo não-JSON */
      }
      throw new ApiError(msg, res.status);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  health() {
    return this.req<{ ok: boolean; version: string; engine: string }>('/api/health');
  }
  register(input: { name: string; email: string; password: string }) {
    return this.req<{ token: string; user: CloudUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  login(input: { email: string; password: string }) {
    return this.req<{ token: string; user: CloudUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  listPatients() {
    return this.req<Patient[]>('/api/patients');
  }
  upsertPatient(p: Patient) {
    return this.req<Patient>(`/api/patients/${encodeURIComponent(p.id)}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    });
  }
  listLogs() {
    return this.req<IdEvent[]>('/api/log');
  }
  pushLog(e: IdEvent) {
    return this.req<void>('/api/log', { method: 'POST', body: JSON.stringify(e) });
  }
}

/* ------------------- servidor de demonstração embutido ------------------ */
/* Implementa o MESMO contrato no navegador (latência simulada, usuários,  */
/* senhas com SHA-256, visibilidade por dono/delegação). Rotulado como     */
/* demo na UI — serve para validar o fluxo antes de subir o servidor real. */

const DB_KEY = 'vitalis.server.db.v1';

interface DbUser {
  id: string;
  name: string;
  email: string;
  passHash: string;
  createdAt: number;
}
interface DbGrant {
  id: string;
  accountId: string;
  patientId: string;
}
interface DbShape {
  users: DbUser[];
  patients: Array<Patient & { ownerUserId: string }>;
  grants: DbGrant[];
  logs: IdEvent[];
}

function loadDb(): DbShape {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DbShape;
  } catch {
    /* banco demo corrompido — recria */
  }
  return { users: [], patients: [], grants: [], logs: [] };
}

function saveDb(db: DbShape) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function localUid(): string {
  return crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2, 10);
}

export class DemoApi implements VitalisApi {
  async health() {
    await delay(220);
    return { ok: true, version: 'demo-1.0.0', engine: 'demo embutida (navegador)' };
  }

  private parseToken(token: string): string {
    try {
      const payload = JSON.parse(atob(token)) as { uid: string; exp: number };
      if (payload.exp < Date.now()) throw new ApiError('Sessão expirada — entre novamente.', 401);
      return payload.uid;
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError('Token inválido.', 401);
    }
  }

  async register(input: { name: string; email: string; password: string }) {
    await delay(420);
    const db = loadDb();
    const email = input.email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) {
      throw new ApiError('Este e-mail já possui conta no servidor de demonstração.', 409);
    }
    const user: DbUser = {
      id: localUid(),
      name: input.name.trim(),
      email,
      passHash: await sha256(input.password),
      createdAt: Date.now(),
    };
    db.users.push(user);
    saveDb(db);
    const token = btoa(JSON.stringify({ uid: user.id, exp: Date.now() + 7 * 86_400_000 }));
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  }

  async login(input: { email: string; password: string }) {
    await delay(380);
    const db = loadDb();
    const user = db.users.find((u) => u.email === input.email.trim().toLowerCase());
    if (!user || user.passHash !== (await sha256(input.password))) {
      throw new ApiError('E-mail ou senha incorretos.', 401);
    }
    const token = btoa(JSON.stringify({ uid: user.id, exp: Date.now() + 7 * 86_400_000 }));
    return { token, user: { id: user.id, name: user.name, email: user.email } };
  }

  private visible(db: DbShape, uid: string) {
    const granted = new Set(db.grants.filter((g) => g.accountId === uid).map((g) => g.patientId));
    return db.patients.filter((p) => p.ownerUserId === uid || granted.has(p.id));
  }

  async listPatients(token: string = this.demoToken) {
    await delay(300 + Math.random() * 250);
    const uid = this.parseToken(token);
    const db = loadDb();
    return this.visible(db, uid).map(({ ownerUserId: _o, ...p }) => p as Patient);
  }

  async upsertPatient(p: Patient, token: string = this.demoToken) {
    await delay(240 + Math.random() * 200);
    const uid = this.parseToken(token);
    const db = loadDb();
    const idx = db.patients.findIndex((x) => x.id === p.id);
    if (idx >= 0) {
      db.patients[idx] = { ...p, ownerUserId: db.patients[idx].ownerUserId };
    } else {
      db.patients.push({ ...p, ownerUserId: uid, record: p.record || newRecordNumber(db.patients) });
    }
    saveDb(db);
    const { ownerUserId: _o, ...rest } = db.patients.find((x) => x.id === p.id)!;
    return rest as Patient;
  }

  async listLogs(token: string = this.demoToken) {
    await delay(260);
    const uid = this.parseToken(token);
    const db = loadDb();
    const mine = new Set(this.visible(db, uid).map((p) => p.id));
    return db.logs.filter((l) => l.patientId === null || mine.has(l.patientId)).slice(0, 100);
  }

  async pushLog(e: IdEvent, token: string = this.demoToken) {
    await delay(180);
    this.parseToken(token);
    const db = loadDb();
    db.logs.unshift(e);
    db.logs = db.logs.slice(0, 200);
    saveDb(db);
  }

  /** token usado quando a tela opera direto (logado via CloudScreen) */
  private demoToken = '';
  setToken(t: string) {
    this.demoToken = t;
  }
}

/* ------------------------------ fábrica -------------------------------- */

export function makeApi(cloud: CloudState): VitalisApi {
  if (cloud.mode === 'demo') {
    const api = new DemoApi();
    api.setToken(cloud.token);
    return api;
  }
  return new HttpApi(cloud.baseUrl, cloud.token);
}

/* --------------------------- sincronização ----------------------------- */

export interface SyncProgress {
  phase: 'push' | 'pull' | 'log';
  current: number;
  total: number;
  label: string;
}

export async function syncNow(
  api: VitalisApi,
  localPatients: Patient[],
  localLogs: IdEvent[],
  onProgress: (p: SyncProgress) => void,
): Promise<{ patients: Patient[]; pushed: number; pulled: number }> {
  // 1) push — envia cada ficha local para o servidor
  let pushed = 0;
  for (const p of localPatients) {
    onProgress({ phase: 'push', current: pushed, total: localPatients.length, label: `Enviando ${p.name}…` });
    await api.upsertPatient(p);
    pushed += 1;
  }
  onProgress({ phase: 'push', current: pushed, total: localPatients.length, label: 'Fichas enviadas.' });

  // 2) logs — envia a auditoria local
  onProgress({ phase: 'log', current: 0, total: localLogs.length, label: 'Enviando auditoria…' });
  for (const e of localLogs.slice(0, 40)) {
    try {
      await api.pushLog(e);
    } catch {
      /* evento duplicado ou rejeitado — segue */
    }
  }

  // 3) pull — o servidor é a fonte da verdade após o push
  onProgress({ phase: 'pull', current: 0, total: 1, label: 'Baixando prontuários do servidor…' });
  const patients = await api.listPatients();
  onProgress({ phase: 'pull', current: 1, total: 1, label: 'Sincronização concluída.' });

  return { patients, pushed, pulled: patients.length };
}
