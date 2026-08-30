import { randomInt, randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me';
const JWT_TTL = '7d';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

interface AuthedRequest extends Request {
  userId?: string;
}

const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

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

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

function randomCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function visiblePatientIds(userId: string): Promise<Set<string>> {
  const [owned, grants] = await Promise.all([
    prisma.patient.findMany({ where: { ownerUserId: userId, archived: false }, select: { id: true } }),
    prisma.accessGrant.findMany({
      where: {
        accountId: userId,
        revokedAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      select: { patientId: true },
    }),
  ]);
  return new Set([...owned.map((p) => p.id), ...grants.map((g) => g.patientId)]);
}

/** Cadastro nativo da API V1. Cria a conta e o prontuário pessoal no mesmo commit transacional. */
router.post('/auth/register', async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const phone = String(body.phone ?? '').trim() || null;
  const password = String(body.password ?? '');

  if (name.length < 2) return fail(res, 400, 'Informe seu nome.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Informe um e-mail válido.');
  if (password.length < 8) return fail(res, 400, 'A senha deve ter pelo menos 8 caracteres.');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail(res, 409, 'Já existe uma conta com este e-mail.');

  const passwordHash = await bcrypt.hash(password, 12);
  const patientId = randomUUID();

  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, phone, passwordHash },
      });

      await tx.patient.create({
        data: {
          id: patientId,
          name,
          ownerUserId: created.id,
          data: {
            id: patientId,
            name,
            relationshipToOwner: 'self',
            createdByUserId: created.id,
          },
        },
      });

      return created;
    });

    return res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      requiresMfaLogin: true,
    });
  } catch (error: any) {
    if (error?.code === 'P2002') return fail(res, 409, 'E-mail ou celular já cadastrado.');
    console.error('V1 register error', error);
    return fail(res, 500, 'Não foi possível criar sua conta agora.');
  }
});

/**
 * Login V1 — etapa 1.
 * Valida usuário/senha e cria um desafio MFA. NÃO emite JWT nesta etapa.
 * channel: email | sms. SMS só é permitido quando há celular cadastrado.
 */
router.post('/auth/login/start', async (req: Request, res: Response) => {
  const { email, password, channel = 'email' } = req.body ?? {};
  const normalized = String(email ?? '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.passwordHash))) {
    return fail(res, 401, 'E-mail ou senha incorretos.');
  }

  const selectedChannel = String(channel) === 'sms' ? 'sms' : 'email';
  const destination = selectedChannel === 'sms' ? user.phone : user.email;
  if (!destination) {
    return fail(res, 400, selectedChannel === 'sms' ? 'Nenhum celular cadastrado para este usuário.' : 'Nenhum e-mail cadastrado.');
  }

  const code = randomCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await prisma.$transaction([
    prisma.verificationChallenge.updateMany({
      where: { userId: user.id, purpose: 'login', channel: selectedChannel, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.verificationChallenge.create({
      data: {
        userId: user.id,
        purpose: 'login',
        channel: selectedChannel,
        destination,
        codeHash,
        expiresAt,
      },
    }),
  ]);

  const challenge = await prisma.verificationChallenge.findFirst({
    where: { userId: user.id, purpose: 'login', channel: selectedChannel, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return fail(res, 500, 'Não foi possível iniciar a verificação.');

  // Nesta fase, o envio real fica desacoplado. Em produção, um worker/provedor
  // enviará o código. Em desenvolvimento o código volta na resposta para teste.
  const developmentCode = process.env.NODE_ENV === 'production' ? undefined : code;

  return res.json({
    challengeId: challenge.id,
    channel: selectedChannel,
    destinationMasked: selectedChannel === 'sms' ? maskPhone(destination) : maskEmail(destination),
    expiresAt: expiresAt.toISOString(),
    ...(developmentCode ? { developmentCode } : {}),
  });
});

/** Login V1 — etapa 2. Somente após MFA válido o JWT é emitido. */
router.post('/auth/login/verify', async (req: Request, res: Response) => {
  const { challengeId, code } = req.body ?? {};
  const challenge = await prisma.verificationChallenge.findUnique({
    where: { id: String(challengeId ?? '') },
    include: { user: true },
  });

  if (!challenge || challenge.purpose !== 'login') return fail(res, 400, 'Código de verificação inválido.');
  if (challenge.consumedAt) return fail(res, 400, 'Este código já foi utilizado.');
  if (challenge.expiresAt.getTime() < Date.now()) return fail(res, 400, 'Código expirado. Solicite um novo código.');
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return fail(res, 429, 'Número máximo de tentativas excedido.');

  const valid = await bcrypt.compare(String(code ?? ''), challenge.codeHash);
  if (!valid) {
    await prisma.verificationChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return fail(res, 401, 'Código incorreto.');
  }

  await prisma.verificationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });

  return res.json({
    token: sign(challenge.user.id),
    user: {
      id: challenge.user.id,
      name: challenge.user.name,
      email: challenge.user.email,
      phone: challenge.user.phone,
    },
  });
});

/** Perfis/prontuários que o usuário autenticado pode abrir após o login. */
router.get('/profiles', auth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const [owned, grants] = await Promise.all([
    prisma.patient.findMany({ where: { ownerUserId: userId, archived: false }, orderBy: { name: 'asc' } }),
    prisma.accessGrant.findMany({
      where: {
        accountId: userId,
        revokedAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      include: { patient: true },
    }),
  ]);

  const items = [
    ...owned.map((p) => ({
      id: p.id,
      record: p.record,
      name: p.name,
      relationship: (p.data as any)?.relationshipToOwner ?? 'self',
      accessLevel: 'owner',
      source: 'owned',
    })),
    ...grants
      .filter((g) => !g.patient.archived && g.patient.ownerUserId !== userId)
      .map((g) => ({
        id: g.patient.id,
        record: g.patient.record,
        name: g.patient.name,
        relationship: (g.patient.data as any)?.relationshipToGrantee ?? 'delegate',
        accessLevel: g.level,
        source: 'delegated',
        validUntil: g.validUntil?.toISOString() ?? null,
      })),
  ];

  const dedup = [...new Map(items.map((x) => [x.id, x])).values()];
  res.json(dedup);
});

/** Cria um perfil dependente sem exigir credenciais próprias. */
router.post('/profiles', auth, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const name = String(body.name ?? '').trim();
  const relationship = String(body.relationship ?? 'dependent');
  if (!name) return fail(res, 400, 'Informe o nome da pessoa.');

  const id = randomUUID();
  const patient = await prisma.patient.create({
    data: {
      id,
      record: String(body.record ?? ''),
      name,
      ownerUserId: req.userId!,
      data: {
        ...body,
        id,
        name,
        relationshipToOwner: relationship,
        createdByUserId: req.userId!,
      },
    },
  });

  res.status(201).json({
    id: patient.id,
    record: patient.record,
    name: patient.name,
    relationship,
    accessLevel: 'owner',
    source: 'owned',
  });
});

/** Linha do tempo clínica de um perfil autorizado. */
router.get('/patients/:patientId/events', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  if (!ids.has(req.params.patientId)) return fail(res, 403, 'Você não tem acesso a este prontuário.');

  const events = await prisma.healthEvent.findMany({
    where: { patientId: req.params.patientId },
    include: { practitioner: true, organization: true, location: true },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  res.json(events);
});

/** Inclui evento manual do usuário/responsável na linha do tempo. */
router.post('/patients/:patientId/events', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  if (!ids.has(req.params.patientId)) return fail(res, 403, 'Você não tem acesso a este prontuário.');

  const body = req.body ?? {};
  const title = String(body.title ?? '').trim();
  const type = String(body.type ?? '').trim();
  const occurredAt = new Date(body.occurredAt ?? Date.now());
  if (!title || !type || Number.isNaN(occurredAt.getTime())) {
    return fail(res, 400, 'Informe tipo, descrição e data/hora válidos.');
  }

  const actor = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, name: true } });
  const event = await prisma.healthEvent.create({
    data: {
      patientId: req.params.patientId,
      type,
      status: 'final',
      title,
      occurredAt,
      endedAt: body.endedAt ? new Date(body.endedAt) : null,
      timezone: String(body.timezone ?? 'America/Sao_Paulo'),
      practitionerId: body.practitionerId ? String(body.practitionerId) : null,
      organizationId: body.organizationId ? String(body.organizationId) : null,
      locationId: body.locationId ? String(body.locationId) : null,
      sourceSystemId: body.sourceSystemId ? String(body.sourceSystemId) : null,
      practitionerNameSnapshot: body.practitionerName ? String(body.practitionerName) : null,
      professionSnapshot: body.profession ? String(body.profession) : null,
      councilSnapshot: body.council ? String(body.council) : null,
      registrationSnapshot: body.registration ? String(body.registration) : null,
      registrationRegionSnapshot: body.registrationRegion ? String(body.registrationRegion) : null,
      organizationNameSnapshot: body.organizationName ? String(body.organizationName) : null,
      locationNameSnapshot: body.locationName ? String(body.locationName) : null,
      payload: body.payload ?? {},
      provenance: {
        source: 'mydoctor_manual',
        actorUserId: req.userId!,
        actorName: actor?.name ?? '',
        createdAt: new Date().toISOString(),
      },
    },
  });

  res.status(201).json(event);
});

export default router;
