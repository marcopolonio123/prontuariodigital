/**
 * Vitalis — API do portal
 * Node + Express + Prisma. Implementa EXATAMENTE o contrato de src/lib/api.ts no app.
 */
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();

const PORT = Number(process.env.PORT ?? 8787);
const JWT_SECRET = process.env.JWT_SECRET ?? 'troque-este-segredo-em-producao';
const JWT_TTL = '7d';

app.use(cors());
app.use(express.json({ limit: '15mb' })); // fotos de receitas/carteirinhas anexadas

interface AuthedRequest extends Request {
  userId?: string;
}

function sign(userId: string): string {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: JWT_TTL });
}

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: string };
    req.userId = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada ou credenciais inválidas.' });
  }
}

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

/* ------------------------------- saúde ---------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '1.0.0', engine: 'vitalis-server (Node + Prisma)' });
});

/* ---------------------------- autenticação ------------------------------ */

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !password || String(password).length < 6) {
    return fail(res, 400, 'Informe nome, e-mail e senha com pelo menos 6 caracteres.');
  }
  const normalized = String(email).trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: normalized } });
  if (exists) return fail(res, 409, 'Este e-mail já possui conta.');
  const user = await prisma.user.create({
    data: { name: String(name).trim(), email: normalized, passwordHash: await bcrypt.hash(String(password), 10) },
  });
  res.json({ token: sign(user.id), user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  const user = await prisma.user.findUnique({ where: { email: String(email ?? '').trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.passwordHash))) {
    return fail(res, 401, 'E-mail ou senha incorretos.');
  }
  res.json({ token: sign(user.id), user: { id: user.id, name: user.name, email: user.email } });
});

/* ------------------------------ prontuários ----------------------------- */

async function visiblePatientIds(userId: string): Promise<Set<string>> {
  const [owned, grants] = await Promise.all([
    prisma.patient.findMany({ where: { ownerUserId: userId }, select: { id: true } }),
    prisma.accessGrant.findMany({ where: { accountId: userId }, select: { patientId: true } }),
  ]);
  return new Set([...owned, ...grants].map((x) => ('patientId' in x ? x.patientId : x.id)));
}

const toClient = (p: { id: string; record: string; archived: boolean; data: unknown }) => ({
  ...(p.data as object),
  id: p.id,
  record: p.record,
  archived: p.archived,
});

app.get('/api/patients', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  const patients = await prisma.patient.findMany({
    where: { id: { in: [...ids] }, archived: false },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(patients.map(toClient));
});

app.post('/api/patients', auth, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const id = String(body.id ?? crypto.randomUUID());
  const created = await prisma.patient.create({
    data: {
      id,
      record: String(body.record ?? ''),
      name: String(body.name ?? 'Sem nome'),
      ownerUserId: req.userId!,
      data: body,
    },
  });
  res.json(toClient(created));
});

app.put('/api/patients/:id', auth, async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  const body = req.body ?? {};
  const ids = await visiblePatientIds(req.userId!);
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (existing && !ids.has(id)) return fail(res, 403, 'Você não tem acesso a esta ficha.');
  const saved = await prisma.patient.upsert({
    where: { id },
    update: {
      name: String(body.name ?? existing?.name ?? 'Sem nome'),
      archived: Boolean(body.archived ?? existing?.archived ?? false),
      data: body,
    },
    create: {
      id,
      record: String(body.record ?? ''),
      name: String(body.name ?? 'Sem nome'),
      ownerUserId: existing?.ownerUserId ?? req.userId!,
      data: body,
    },
  });
  res.json(toClient(saved));
});

// Regra do produto: NUNCA excluir — apenas arquivar.
app.delete('/api/patients/:id', auth, async (req: AuthedRequest, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) return fail(res, 404, 'Ficha não encontrada.');
  if (existing.ownerUserId !== req.userId) return fail(res, 403, 'Somente o dono pode arquivar.');
  const saved = await prisma.patient.update({ where: { id }, data: { archived: true } });
  res.json(toClient(saved));
});

/* ------------------------------ delegações ------------------------------ */

app.post('/api/grants', auth, async (req: AuthedRequest, res: Response) => {
  const { accountId, patientId, level } = req.body ?? {};
  const p = await prisma.patient.findUnique({ where: { id: String(patientId ?? '') } });
  if (!p || p.ownerUserId !== req.userId) return fail(res, 403, 'Somente o dono da ficha pode delegar acesso.');
  const grant = await prisma.accessGrant.upsert({
    where: { accountId_patientId: { accountId: String(accountId), patientId: String(patientId) } },
    update: { level: String(level ?? 'completo') },
    create: {
      accountId: String(accountId),
      patientId: String(patientId),
      level: String(level ?? 'completo'),
      grantedByName: p.name,
    },
  });
  res.json(grant);
});

app.delete('/api/grants/:id', auth, async (req: AuthedRequest, res: Response) => {
  const grant = await prisma.accessGrant.findUnique({ where: { id: req.params.id } });
  if (!grant) return fail(res, 404, 'Delegação não encontrada.');
  const patient = await prisma.patient.findUnique({ where: { id: grant.patientId } });
  if (patient?.ownerUserId !== req.userId) return fail(res, 403, 'Somente o dono da ficha pode revogar.');
  await prisma.accessGrant.delete({ where: { id: grant.id } });
  res.status(204).end();
});

/* ------------------------------- auditoria ------------------------------ */

app.get('/api/log', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  const logs = await prisma.identificationLog.findMany({
    where: { OR: [{ patientId: null }, { patientId: { in: [...ids] } }] },
    orderBy: { at: 'desc' },
    take: 100,
  });
  res.json(
    logs.map((l) => ({
      id: l.id,
      method: l.method,
      patientId: l.patientId,
      patientName: l.patientName,
      confidence: l.confidence,
      quality: l.quality,
      result: l.result,
      at: l.at.getTime(),
      thumb: null,
      detail: l.detail ?? undefined,
      byName: l.byName,
    })),
  );
});

app.post('/api/log', auth, async (req: AuthedRequest, res: Response) => {
  const b = req.body ?? {};
  await prisma.identificationLog.create({
    data: {
      id: String(b.id ?? crypto.randomUUID()),
      method: String(b.method ?? 'face'),
      patientId: b.patientId ? String(b.patientId) : null,
      patientName: String(b.patientName ?? '—'),
      confidence: Number(b.confidence ?? 0),
      quality: b.quality === null || b.quality === undefined ? null : Number(b.quality),
      result: String(b.result ?? 'none'),
      byUserId: req.userId!,
      byName: String(b.byName ?? ''),
      detail: b.detail ? String(b.detail) : null,
      at: new Date(Number(b.at ?? Date.now())),
    },
  });
  res.status(201).json({ ok: true });
});

/* -------------------------------- subida -------------------------------- */

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Vitalis API ouvindo na porta ${PORT} — saúde em /api/health`);
});
