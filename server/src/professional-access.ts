import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';
import {managedPatientWhere,managesPatient,personalOwnerIds} from './patient-permissions.js';

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
    where: { ownerUserId: user.id, archived: false, data:{path:['relationshipToOwner'],equals:'self'} },
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

  try {
    const result = await prisma.$transaction(async tx => {
      const locked = await tx.practitioner.updateMany({ where: { id: practitioner.id, active: true, verificationStatus: 'verified' }, data: { updatedAt: new Date() } });
      if (!locked.count) throw new Error('UNVERIFIED');
      const now = new Date();
      const active = await tx.accessGrant.findFirst({ where: { accountId: req.userId!, patientId, practitionerId: practitioner.id, permission: 'read_write_consultation', revokedAt: null, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] } });
      if (active) throw new Error('ACTIVE');
      const existing = await tx.accessRequest.findFirst({ where: { requesterUserId: req.userId!, practitionerId: practitioner.id, patientId, status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { requestedAt: 'desc' } });
      if (existing) return { row: existing, created: false };
      const row = await tx.accessRequest.create({ data: { requesterUserId: req.userId!, practitionerId: practitioner.id, patientId, requestedScope: ['record', 'documents', 'vitals', 'insurance'], requestedPermission: 'read_write_consultation', status: 'pending', expiresAt: new Date(now.getTime() + REQUEST_TTL_HOURS * 60 * 60 * 1000) } });
      return { row, created: true };
    }, { maxWait: 10000, timeout: 20000 });
    return res.status(result.created ? 201 : 200).json({ id: result.row.id, patientId, patientName: patient.name, status: result.row.status, requestedAt: result.row.requestedAt.toISOString(), expiresAt: result.row.expiresAt?.toISOString() ?? null });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    return fail(res, code === 'ACTIVE' ? 409 : code === 'UNVERIFIED' ? 403 : 503, code === 'ACTIVE' ? 'Você já possui autorização ativa para este paciente. Use o acesso existente; solicite novamente somente após vencimento ou revogação.' : code === 'UNVERIFIED' ? 'Clinicar está disponível somente para profissional verificado.' : 'Não foi possível solicitar acesso. Atualize a lista e tente novamente.');
  }
});

router.get('/access-requests/incoming', auth, async (req: AuthedRequest, res: Response) => {
  const owned = await prisma.patient.findMany({ where: managedPatientWhere(req.userId!), select: { id: true } });
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
  if (!managesPatient(request.patient,req.userId!)) return fail(res, 403, 'Somente o titular deste prontuário pode decidir.');
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
    await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${request.patientId} FOR UPDATE`;
    const currentPatient=await tx.patient.findUnique({where:{id:request.patientId}});
    if(!currentPatient||!managesPatient(currentPatient,req.userId!))throw new Error('FORBIDDEN');
    // Lock professional row to serialize approval against suspension/revalidation.
    const verified = await tx.practitioner.updateMany({ where: { id: request.practitionerId ?? '', active: true, verificationStatus: 'verified' }, data: { updatedAt: new Date() } });
    if (!verified.count) throw new Error('UNVERIFIED');
    const claimed = await tx.accessRequest.updateMany({ where: { id: request.id, status: 'pending', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, data: { status: 'approved', decidedAt: now, decidedByUserId: req.userId!, decisionNote: note } });
    if (!claimed.count) throw new Error('DECIDED');
    const existing = await tx.accessGrant.findFirst({
      where: { accountId: request.requesterUserId, patientId: request.patientId },
      orderBy: { createdAt: 'desc' },
    });
    // Historical deployments may enforce one grant per account/patient pair.
    // Renew that row instead of inserting a duplicate; retain the request audit trail.
    await tx.accessGrant.updateMany({
      where: { accountId: request.requesterUserId, patientId: request.patientId, revokedAt: null, ...(existing ? { id: { not: existing.id } } : {}) },
      data: { revokedAt: now },
    });
    if (existing?.sourceRequestId && existing.sourceRequestId !== request.id) {
      await tx.accessRequest.updateMany({ where: { id: existing.sourceRequestId, status: { in: ['pending', 'approved'] } }, data: { status: 'revoked' } });
    }
    const grantData = {
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
      revokedAt: null as Date | null,
    };
    const grant = existing
      ? await tx.accessGrant.update({ where: { id: existing.id }, data: grantData })
      : await tx.accessGrant.create({ data: grantData });
    return grant;
  }, { maxWait: 10000, timeout: 20000 });

  return res.json({ id: request.id, status: 'approved', decidedAt: now.toISOString(), grantId: result.id, validUntil: result.validUntil?.toISOString() ?? null });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if(code==='FORBIDDEN')return fail(res,403,'A tutoria mudou. Você não pode mais autorizar este prontuário.');
    if (code === 'UNVERIFIED') return fail(res, 403, 'Este profissional não possui validação ativa. Não é possível autorizar o acesso.');
    if (code === 'DECIDED') return fail(res, 409, 'Esta solicitação já foi decidida ou expirou. Atualize a lista.');
    const databaseCode = String((error as { code?: string })?.code ?? 'UNKNOWN');
    // Only error identifiers in logs/response: do not print patient data or query parameters.
    console.error('MyDoctor: falha na autorização do prontuário', { code: databaseCode, target: (error as { meta?: { target?: unknown } })?.meta?.target });
    const reason = databaseCode === 'P2028' || databaseCode === 'P1008' || databaseCode === 'P2024' ? 'O banco excedeu o tempo de resposta.' : databaseCode === 'P2022' || databaseCode === 'P2021' ? 'A estrutura do banco precisa ser atualizada.' : databaseCode === 'P2002' ? 'Existe um conflito com uma autorização anterior.' : databaseCode === 'P2003' ? 'Um vínculo necessário para a autorização está inconsistente.' : databaseCode === 'P2034' ? 'Houve um conflito entre operações simultâneas.' : 'O servidor não conseguiu concluir a gravação.';
    return fail(res, 503, `Não foi possível autorizar. ${reason} Código: ${databaseCode}. Nenhuma nova autorização foi confirmada.`);
  }
});

router.post('/access-requests/:id/revoke', auth, async (req: AuthedRequest, res: Response) => {
  try {
    await prisma.$transaction(async tx => {
      const request = await tx.accessRequest.findUnique({ where: { id: req.params.id }, include: { patient: true } });
      if (!request) throw new Error('NOT_FOUND');
      if (!managesPatient(request.patient,req.userId!)) throw new Error('FORBIDDEN');
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




