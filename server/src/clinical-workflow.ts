import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me';

interface AuthedRequest extends Request { userId?: string }
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

// Linha do tempo principal: somente registros já confirmados/finais.
router.get('/patients/:patientId/events', auth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const patientId = req.params.patientId;
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { ownerUserId: true, archived: true } });
  if (!patient || patient.archived) return fail(res, 404, 'Prontuário não encontrado.');

  const owns = patient.ownerUserId === userId;
  const grant = owns ? null : await prisma.accessGrant.findFirst({
    where: { accountId: userId, patientId, revokedAt: null, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
  });
  if (!owns && !grant) return fail(res, 403, 'Você não tem acesso a este prontuário.');

  const events = await prisma.healthEvent.findMany({
    where: { patientId, status: 'final' },
    include: { practitioner: true, organization: true, location: true },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return res.json(events);
});

router.post('/professional/consultations', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar exige perfil profissional verificado e ativo.');

  const body = req.body ?? {};
  const accessRequestId = String(body.accessRequestId ?? '').trim();
  const title = String(body.title ?? '').trim();
  const occurredAt = new Date(body.occurredAt ?? Date.now());
  if (!accessRequestId) return fail(res, 400, 'Informe a autorização do paciente.');
  if (!title || Number.isNaN(occurredAt.getTime())) return fail(res, 400, 'Informe descrição e data/hora válidas.');

  const accessRequest = await prisma.accessRequest.findUnique({
    where: { id: accessRequestId },
    include: { grant: true, patient: true },
  });
  if (!accessRequest || accessRequest.requesterUserId !== req.userId || accessRequest.practitionerId !== practitioner.id) {
    return fail(res, 404, 'Autorização não encontrada.');
  }
  if (accessRequest.status !== 'approved' || !accessRequest.grant || accessRequest.grant.revokedAt) {
    return fail(res, 403, 'O paciente ainda não autorizou este atendimento ou o acesso foi revogado.');
  }
  if (accessRequest.grant.validUntil && accessRequest.grant.validUntil.getTime() <= Date.now()) {
    return fail(res, 403, 'A autorização do paciente expirou. Solicite novo acesso.');
  }
  if (accessRequest.grant.permission !== 'read_write_consultation') {
    return fail(res, 403, 'Esta autorização não permite registrar atendimento.');
  }

  const registration = practitioner.registrations.find((item) => item.status === 'active') ?? practitioner.registrations[0];
  const event = await prisma.healthEvent.create({
    data: {
      patientId: accessRequest.patientId,
      type: 'consultation',
      status: 'pending_patient_confirmation',
      title,
      occurredAt,
      timezone: String(body.timezone ?? 'America/Sao_Paulo'),
      practitionerId: practitioner.id,
      authoredByUserId: req.userId!,
      accessGrantId: accessRequest.grant.id,
      practitionerNameSnapshot: practitioner.name,
      professionSnapshot: practitioner.profession,
      councilSnapshot: registration?.authority.code ?? null,
      registrationSnapshot: registration?.registration ?? null,
      registrationRegionSnapshot: registration?.region ?? null,
      organizationNameSnapshot: String(body.organizationName ?? '').trim() || null,
      payload: {
        notes: String(body.notes ?? '').trim(),
        accessRequestId,
        confirmationRequired: true,
      },
      provenance: {
        source: 'mydoctor_professional',
        workflow: 'patient_confirmation_required',
        practitionerUserId: req.userId!,
        createdAt: new Date().toISOString(),
      },
    },
  });
  return res.status(201).json(event);
});

router.get('/professional/consultations', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar exige perfil profissional verificado e ativo.');
  const items = await prisma.healthEvent.findMany({
    where: { practitionerId: practitioner.id, authoredByUserId: req.userId!, type: 'consultation' },
    include: { patient: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json(items.map((item) => ({
    id: item.id,
    patientId: item.patientId,
    patientName: item.patient.name,
    title: item.title,
    occurredAt: item.occurredAt.toISOString(),
    status: item.status,
    createdAt: item.createdAt.toISOString(),
  })));
});

router.get('/consultations/incoming', auth, async (req: AuthedRequest, res: Response) => {
  const items = await prisma.healthEvent.findMany({
    where: {
      type: 'consultation',
      status: 'pending_patient_confirmation',
      patient: { ownerUserId: req.userId!, archived: false },
    },
    include: { patient: { select: { id: true, name: true } }, practitioner: { include: { registrations: { include: { authority: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(items.map((item) => ({
    id: item.id,
    patientId: item.patientId,
    patientName: item.patient.name,
    title: item.title,
    occurredAt: item.occurredAt.toISOString(),
    organizationName: item.organizationNameSnapshot,
    profession: item.professionSnapshot,
    practitionerName: item.practitionerNameSnapshot ?? item.practitioner?.name ?? 'Profissional de saúde',
    council: item.councilSnapshot,
    registration: item.registrationSnapshot,
    region: item.registrationRegionSnapshot,
    notes: typeof item.payload === 'object' && item.payload && !Array.isArray(item.payload) ? String((item.payload as Record<string, unknown>).notes ?? '') : '',
    createdAt: item.createdAt.toISOString(),
  })));
});

router.post('/consultations/:id/decision', auth, async (req: AuthedRequest, res: Response) => {
  const decision = String(req.body?.decision ?? '');
  if (!['confirm', 'reject'].includes(decision)) return fail(res, 400, 'Decisão inválida.');
  const event = await prisma.healthEvent.findUnique({ where: { id: req.params.id }, include: { patient: true } });
  if (!event || event.patient.ownerUserId !== req.userId!) return fail(res, 404, 'Atendimento não encontrado.');
  if (event.status !== 'pending_patient_confirmation') return fail(res, 409, 'Este atendimento já foi decidido.');

  const status = decision === 'confirm' ? 'final' : 'rejected_by_patient';
  const updated = await prisma.healthEvent.update({
    where: { id: event.id },
    data: {
      status,
      provenance: {
        source: 'mydoctor_professional',
        workflow: 'patient_confirmation_required',
        patientDecision: decision,
        patientUserId: req.userId!,
        decidedAt: new Date().toISOString(),
      },
    },
  });
  return res.json({ id: updated.id, status: updated.status });
});

export default router;
