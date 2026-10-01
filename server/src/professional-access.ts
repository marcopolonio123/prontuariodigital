import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me';
const REQUEST_TTL_HOURS = 24;
const GRANT_TTL_HOURS = 24;

interface AuthedRequest extends Request { userId?: string; }
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.userId = (jwt.verify(token, JWT_SECRET) as { uid: string }).uid;
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada ou credenciais inválidas.' });
  }
}

async function verifiedPractitioner(userId: string) {
  return prisma.practitioner.findFirst({
    where: { userId, active: true, verificationStatus: 'verified' },
    include: { registrations: { include: { authority: true } } },
  });
}

router.get('/professional/patients/lookup', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar está disponível somente para profissional verificado.');

  const email = String(req.query.email ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail(res, 400, 'Informe o e-mail exato do paciente.');

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user || user.id === req.userId) return res.json(null);

  const patient = await prisma.patient.findFirst({
    where: { ownerUserId: user.id, archived: false },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  });
  if (!patient) return res.json(null);

  return res.json({ patientId: patient.id, name: patient.name });
});

router.get('/professional/access-requests', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar está disponível somente para profissional verificado.');

  const rows = await prisma.accessRequest.findMany({
    where: { requesterUserId: req.userId!, practitionerId: practitioner.id },
    include: { patient: { select: { name: true } }, grant: { select: { id: true, validUntil: true, revokedAt: true } } },
    orderBy: { requestedAt: 'desc' },
    take: 50,
  });

  return res.json(rows.map((row) => ({
    id: row.id,
    patientId: row.patientId,
    patientName: row.patient.name,
    status: row.status,
    requestedPermission: row.requestedPermission,
    requestedScope: row.requestedScope,
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    grantId: row.grant?.id ?? null,
    grantValidUntil: row.grant?.validUntil?.toISOString() ?? null,
    grantRevokedAt: row.grant?.revokedAt?.toISOString() ?? null,
  })));
});

router.post('/professional/access-requests', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar está disponível somente para profissional verificado.');

  const patientId = String(req.body?.patientId ?? '').trim();
  if (!patientId) return fail(res, 400, 'Paciente não informado.');
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true, name: true, ownerUserId: true, archived: true } });
  if (!patient || patient.archived) return fail(res, 404, 'Paciente não encontrado.');
  if (patient.ownerUserId === req.userId) return fail(res, 400, 'Use seu prontuário pessoal para registrar seus próprios atendimentos.');

  const now = new Date();
  const existing = await prisma.accessRequest.findFirst({
    where: { requesterUserId: req.userId!, practitionerId: practitioner.id, patientId, status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: { requestedAt: 'desc' },
  });
  if (existing) return res.status(200).json({ id: existing.id, patientId, patientName: patient.name, status: existing.status, requestedAt: existing.requestedAt.toISOString(), expiresAt: existing.expiresAt?.toISOString() ?? null });

  const created = await prisma.accessRequest.create({
    data: {
      requesterUserId: req.userId!,
      practitionerId: practitioner.id,
      patientId,
      requestedScope: ['record', 'documents', 'vitals', 'insurance'],
      requestedPermission: 'read_write_consultation',
      status: 'pending',
      expiresAt: new Date(now.getTime() + REQUEST_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  return res.status(201).json({ id: created.id, patientId, patientName: patient.name, status: created.status, requestedAt: created.requestedAt.toISOString(), expiresAt: created.expiresAt?.toISOString() ?? null });
});

router.get('/access-requests/incoming', auth, async (req: AuthedRequest, res: Response) => {
  const owned = await prisma.patient.findMany({ where: { ownerUserId: req.userId!, archived: false }, select: { id: true } });
  const patientIds = owned.map((p) => p.id);
  if (patientIds.length === 0) return res.json([]);

  const rows = await prisma.accessRequest.findMany({
    where: { patientId: { in: patientIds } },
    take: 200,
    include: {
      grant: { select: { id: true, validUntil: true, revokedAt: true } },
      patient: { select: { name: true } },
      requester: { select: { name: true } },
      practitioner: { include: { registrations: { include: { authority: true } } } },
    },
    orderBy: { requestedAt: 'desc' },
  });

  const now = Date.now();
  return res.json(rows.map((row) => ({
    status: row.status === 'pending' && row.expiresAt && row.expiresAt.getTime() <= now ? 'expired' : row.status === 'approved' && row.grant?.revokedAt ? 'revoked' : row.status === 'approved' && row.grant?.validUntil && row.grant.validUntil.getTime() <= now ? 'expired' : row.status,
    grantId: row.grant?.id ?? null,
    grantValidUntil: row.grant?.validUntil?.toISOString() ?? null,
    grantRevokedAt: row.grant?.revokedAt?.toISOString() ?? null,
    id: row.id,
    patientId: row.patientId,
    patientName: row.patient.name,
    requesterName: row.requester.name,
    practitionerName: row.practitioner?.name ?? row.requester.name,
    profession: row.practitioner?.profession ?? null,
    specialty: row.practitioner?.specialty ?? null,
    registrations: row.practitioner?.registrations.map((reg) => ({ council: reg.authority.code, registration: reg.registration, region: reg.region, status: reg.status })) ?? [],
    requestedPermission: row.requestedPermission,
    requestedScope: row.requestedScope,
    requestedAt: row.requestedAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
  })));
});

router.post('/access-requests/:id/decision', auth, async (req: AuthedRequest, res: Response) => {
  const decision = String(req.body?.decision ?? '').trim().toLowerCase();
  if (!['approve', 'reject'].includes(decision)) return fail(res, 400, 'Decisão inválida.');

  const request = await prisma.accessRequest.findUnique({
    where: { id: req.params.id },
    include: { patient: true, practitioner: true },
  });
  if (!request) return fail(res, 404, 'Solicitação não encontrada.');
  if (request.patient.ownerUserId !== req.userId) return fail(res, 403, 'Somente o titular deste prontuário pode decidir.');
  if (request.status !== 'pending') return fail(res, 409, 'Esta solicitação já foi decidida.');
  if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
    await prisma.accessRequest.updateMany({ where: { id: request.id, status: 'pending' }, data: { status: 'expired', decidedAt: new Date(), decidedByUserId: req.userId! } });
    return fail(res, 410, 'Esta solicitação expirou.');
  }

  const note = String(req.body?.note ?? '').trim() || null;
  const now = new Date();
  if (decision === 'reject') {
    const changed = await prisma.accessRequest.updateMany({ where: { id: request.id, status: 'pending' }, data: { status: 'rejected', decidedAt: now, decidedByUserId: req.userId!, decisionNote: note } });
    if (!changed.count) return fail(res, 409, 'Esta solicitação já foi decidida.');
    const rejected = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    return res.json({ id: rejected.id, status: rejected.status, decidedAt: rejected.decidedAt?.toISOString() ?? null });
  }

  let validUntil: Date | null = new Date(now.getTime() + GRANT_TTL_HOURS * 60 * 60 * 1000);
  const duration = req.body?.duration;
  if (duration === 'indefinite') validUntil = null;
  else if (duration === 'until') {
    const raw = req.body?.validUntil;
    if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return fail(res, 400, 'Informe data, horário e fuso do término do acesso.');
    validUntil = new Date(raw);
    if (!Number.isFinite(validUntil.getTime()) || validUntil.getTime() <= now.getTime()) return fail(res, 400, 'O término do acesso deve ser uma data e horário no futuro.');
  } else if (duration !== undefined) return fail(res, 400, 'Escolha acesso por tempo indeterminado ou até data e horário.');
  try {
  const result = await prisma.$transaction(async (tx) => {
    // Lock professional row to serialize approval against suspension/revalidation.
    const verified = await tx.practitioner.updateMany({ where: { id: request.practitionerId ?? '', active: true, verificationStatus: 'verified' }, data: { updatedAt: new Date() } });
    if (!verified.count) throw new Error('UNVERIFIED');
    const claimed = await tx.accessRequest.updateMany({ where: { id: request.id, status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, data: { status: 'approved', decidedAt: now, decidedByUserId: req.userId!, decisionNote: note } });
    if (!claimed.count) throw new Error('DECIDED');
    await tx.accessGrant.updateMany({
      where: { accountId: request.requesterUserId, patientId: request.patientId, revokedAt: null },
      data: { revokedAt: now },
    });
    const grant = await tx.accessGrant.create({
      data: {
        accountId: request.requesterUserId,
        patientId: request.patientId,
        grantedByUserId: req.userId!,
        grantedByName: request.patient.name,
        practitionerId: request.practitionerId,
        sourceRequestId: request.id,
        level: 'completo',
        scope: request.requestedScope,
        permission: request.requestedPermission,
        validFrom: now,
        validUntil,
      },
    });
    const approved = await tx.accessRequest.update({
      where: { id: request.id },
      data: { status: 'approved', decidedAt: now, decidedByUserId: req.userId!, decisionNote: note },
    });
    return { grant, approved };
  });

  return res.json({ id: result.approved.id, status: result.approved.status, decidedAt: result.approved.decidedAt?.toISOString() ?? null, grantId: result.grant.id, validUntil: result.grant.validUntil?.toISOString() ?? null });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return fail(res, code === 'UNVERIFIED' ? 403 : code === 'DECIDED' ? 409 : 503, code === 'UNVERIFIED' ? 'Este profissional não possui validação ativa. Não é possível autorizar o acesso.' : code === 'DECIDED' ? 'Esta solicitação já foi decidida. Atualize a lista.' : 'Não foi possível autorizar. Atualize a lista para conferir o status antes de tentar novamente.');
  }
});

router.post('/access-requests/:id/revoke', auth, async (req: AuthedRequest, res: Response) => {
  try {
    await prisma.$transaction(async tx => {
      const request = await tx.accessRequest.findUnique({ where: { id: req.params.id }, include: { patient: true } });
      if (!request) throw new Error('NOT_FOUND');
      if (request.patient.ownerUserId !== req.userId) throw new Error('FORBIDDEN');
      if (request.status !== 'approved' && request.status !== 'revoked') throw new Error('STATUS');
      await tx.accessRequest.update({ where: { id: request.id }, data: { status: 'revoked' } });
      await tx.accessGrant.updateMany({ where: { sourceRequestId: request.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    res.json({ status: 'revoked' });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    fail(res, code === 'NOT_FOUND' ? 404 : code === 'FORBIDDEN' ? 403 : code === 'STATUS' ? 409 : 503, code === 'FORBIDDEN' ? 'Somente o titular deste prontuário pode revogar.' : code === 'STATUS' ? 'Não existe autorização ativa nesta solicitação.' : 'Não foi possível revogar o acesso. Atualize a lista e tente novamente.');
  }
});

export default router;

