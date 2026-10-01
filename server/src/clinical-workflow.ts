import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';
import { purgeExpiredDiary, retainedDiaryEntries } from './diary-retention.js';

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

// A linha do tempo manual (GET/POST /patients/:patientId/events) pertence ao v1Router.
 // Este router trata apenas o workflow profissional/confirmacao do paciente.
 // Evitamos duas rotas concorrentes para o mesmo recurso, que tornavam a releitura
 // apos novo login dependente da ordem de registro dos routers.

router.get('/professional/patients/:patientId/summary', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar exige perfil profissional verificado e ativo.');
  const now = new Date();
  const grant = await prisma.accessGrant.findFirst({ where: {
    accountId: req.userId!, practitionerId: practitioner.id, patientId: req.params.patientId,
    patient: { archived: false }, permission: 'read_write_consultation', revokedAt: null, validFrom: { lte: now },
    OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  } });
  if (!grant) return fail(res, 403, 'Não há autorização ativa para este prontuário.');
  await purgeExpiredDiary(req.params.patientId);
  const [patient, events, schedules] = await Promise.all([
    prisma.patient.findUnique({ where: { id: req.params.patientId }, select: { data: true } }),
    prisma.healthEvent.findMany({ where: { patientId: req.params.patientId, status: { in: ['final', 'amended'] } },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], select: {
        id: true, patientId: true, type: true, status: true, title: true, occurredAt: true, timezone: true,
        practitionerNameSnapshot: true, professionSnapshot: true, councilSnapshot: true,
        registrationSnapshot: true, registrationRegionSnapshot: true, organizationNameSnapshot: true,
        payload: true, createdAt: true, updatedAt: true,
        documents: { where: { status: { not: 'deleted' } }, select: { id: true, type: true, originalFilename: true } },
      } }),
    prisma.medicationSchedule.findMany({ where: { patientId: req.params.patientId, active: true }, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, dose: true, weekdays: true, times: true, timezone: true, continuousUse: true, startsOn: true, endsOn: true, createdAt: true } }),
  ]);
  const data = patient?.data && typeof patient.data === 'object' && !Array.isArray(patient.data) ? patient.data as Record<string, unknown> : {};
  const record = Object.fromEntries(['birthDate', 'sex', 'allergies', 'intolerances', 'conditions', 'medications', 'specialCare', 'emergencyNotes'].map(key => [key, data[key] ?? null]));
  res.json({ record, schedules, events: events.map(event => event.type === 'wellbeing_diary'
    ? { ...event, payload: { entries: retainedDiaryEntries(event.payload).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)) } } : event) });
});

router.post('/professional/consultations', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Clinicar exige perfil profissional verificado e ativo.');

  const body = req.body ?? {};
  const accessRequestId = String(body.accessRequestId ?? '').trim();
  const title = String(body.title ?? '').trim();
  const occurredAt = new Date(body.occurredAt ?? Date.now());
  const type = String(body.type ?? 'consultation');
  if (!['consultation', 'exam', 'hospitalization', 'procedure', 'therapy', 'vaccine', 'prescription', 'other'].includes(type)) return fail(res, 400, 'Tipo de atendimento inválido.');
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
      type,
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
        symptoms: String(body.symptoms ?? '').trim(),
        diagnosis: String(body.diagnosis ?? '').trim(),
        exams: String(body.exams ?? '').trim(),
        prescriptions: String(body.prescriptions ?? '').trim(),
        specialty: practitioner.specialty ?? null,
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
    where: { practitionerId: practitioner.id, authoredByUserId: req.userId!, status: { in: ['pending_patient_confirmation', 'final', 'rejected_by_patient'] } },
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
    clinical: Object.fromEntries(['symptoms', 'diagnosis', 'exams', 'prescriptions'].map(key => [key, typeof item.payload === 'object' && item.payload && !Array.isArray(item.payload) ? String((item.payload as Record<string, unknown>)[key] ?? '') : ''])),
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

