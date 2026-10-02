import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
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

// Private professional directory. Stored separately from patient records and identity fields.
type ProfessionalLocation = { id: string; name: string; address: string };
function professionalLocations(data: unknown): ProfessionalLocation[] {
  const items = (data as { professionalLocations?: unknown } | null)?.professionalLocations;
  return Array.isArray(items) ? items.filter((item): item is ProfessionalLocation => !!item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.address === 'string') : [];
}
router.get('/professional/locations', auth, async (req: AuthedRequest, res: Response) => {
  if (!await verifiedPractitioner(req.userId!)) return fail(res, 403, 'Perfil profissional não está habilitado.');
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { accountData: true } });
  return res.json(professionalLocations(user?.accountData));
});
async function saveProfessionalLocation(req: AuthedRequest, res: Response, action: 'create' | 'edit' | 'remove') {
  if (!await verifiedPractitioner(req.userId!)) return fail(res, 403, 'Perfil profissional não está habilitado.');
  const name = String(req.body?.name ?? '').trim(), address = String(req.body?.address ?? '').trim();
  if (action !== 'remove' && (name.length < 2 || name.length > 150 || address.length > 300)) return fail(res, 400, 'Informe um nome de 2 a 150 caracteres e endereço de até 300 caracteres.');
  try {
    const result = await prisma.$transaction(async tx => {
      // Lock the same user row as account edits, preserving identity data during concurrent writes.
      const user = await tx.user.update({ where: { id: req.userId! }, data: { updatedAt: new Date() }, select: { accountData: true } });
      const items = professionalLocations(user.accountData);
      const id = action === 'create' ? randomUUID() : req.params.id;
      if (action !== 'create' && !items.some(item => item.id === id)) throw new Error('LOCATION_NOT_FOUND');
      if (action !== 'remove' && items.some(item => item.id !== id && item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error('LOCATION_DUPLICATE');
      const location = { id, name, address };
      const next = action === 'create' ? [...items, location] : action === 'remove' ? items.filter(item => item.id !== id) : items.map(item => item.id === id ? location : item);
      await tx.user.update({ where: { id: req.userId! }, data: { accountData: { ...(user.accountData as Prisma.JsonObject), professionalLocations: next } } });
      return action === 'remove' ? { id, removed: true } : location;
    });
    return res.status(action === 'create' ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'LOCATION_NOT_FOUND') return fail(res, 404, 'Local não encontrado no seu cadastro.');
    if (error instanceof Error && error.message === 'LOCATION_DUPLICATE') return fail(res, 409, 'Já existe um local com esse nome no seu cadastro.');
    throw error;
  }
}
router.post('/professional/locations', auth, (req: AuthedRequest, res: Response) => saveProfessionalLocation(req, res, 'create'));
router.put('/professional/locations/:id', auth, (req: AuthedRequest, res: Response) => saveProfessionalLocation(req, res, 'edit'));
router.delete('/professional/locations/:id', auth, (req: AuthedRequest, res: Response) => saveProfessionalLocation(req, res, 'remove'));

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
  const record = Object.fromEntries(['birthDate', 'sex', 'bloodType', 'allergies', 'intolerances', 'conditions', 'medications', 'specialCare', 'emergencyNotes'].map(key => [key, data[key] ?? null]));
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
      status: 'draft',
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
      organizationNameSnapshot: body.onlineVisit === true ? null : String(body.organizationName ?? '').trim() || null,
      payload: {
        onlineVisit: body.onlineVisit === true,
        homeVisit: body.onlineVisit !== true && body.homeVisit === true,
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
    where: { practitionerId: practitioner.id, authoredByUserId: req.userId!, status: { in: ['draft', 'pending_patient_confirmation', 'final', 'rejected_by_patient', 'amended', 'cancelled'] } },
    include: { patient: { select: { id: true, name: true } } },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
  });
  return res.json(items.map((item) => ({
    id: item.id,
    patientId: item.patientId,
    patientName: item.patient.name,
    title: item.title,
    occurredAt: item.occurredAt.toISOString(),
    status: item.status,
    updatedAt: item.updatedAt.toISOString(),
    createdAt: item.createdAt.toISOString(),
  })));
});

const editableStatuses = ['draft', 'pending_patient_confirmation', 'rejected_by_patient'];
async function currentClinicalGrant(userId: string, practitionerId: string, patientId: string) {
  const now = new Date();
  return prisma.accessGrant.findFirst({ where: { accountId: userId, practitionerId, patientId, patient: { archived: false }, permission: 'read_write_consultation', revokedAt: null, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, orderBy: { createdAt: 'desc' } });
}
router.get('/professional/consultations/:id', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Perfil profissional não está habilitado.');
  const event = await prisma.healthEvent.findFirst({ where: { id: req.params.id, practitionerId: practitioner.id, authoredByUserId: req.userId! }, include: { patient: { select: { name: true } }, documents: { where: { status: { not: 'deleted' } }, select: { id: true, type: true, originalFilename: true } } } });
  if (!event) return fail(res, 404, 'Atendimento não encontrado.');
  const grant = await currentClinicalGrant(req.userId!, practitioner.id, event.patientId);
  const { patient, provenance: _provenance, ...record } = event;
  return res.json({ ...record, patientName: patient.name, editable: editableStatuses.includes(event.status), canSubmit: !!grant && ['draft', 'rejected_by_patient'].includes(event.status) });
});
router.put('/professional/consultations/:id', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Perfil profissional não está habilitado.');
  const event = await prisma.healthEvent.findFirst({ where: { id: req.params.id, practitionerId: practitioner.id, authoredByUserId: req.userId! } });
  if (!event) return fail(res, 404, 'Atendimento não encontrado.');
  if (!editableStatuses.includes(event.status)) return fail(res, 409, 'O paciente já aprovou este atendimento. Ele está disponível somente para consulta.');
  const body = req.body ?? {}, title = String(body.title ?? '').trim(), type = String(body.type ?? event.type), occurredAt = new Date(body.occurredAt ?? event.occurredAt);
  if (!title || Number.isNaN(occurredAt.getTime()) || !['consultation', 'exam', 'hospitalization', 'procedure', 'therapy', 'vaccine', 'prescription', 'other'].includes(type)) return fail(res, 400, 'Informe tipo, descrição e data/hora válidos.');
  const expected = new Date(body.expectedUpdatedAt ?? event.updatedAt);
  if (Number.isNaN(expected.getTime())) return fail(res, 400, 'Versão do atendimento inválida.');
  const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {};
  const updated = await prisma.healthEvent.updateMany({ where: { id: event.id, authoredByUserId: req.userId!, status: { in: editableStatuses }, updatedAt: expected }, data: { title, type, occurredAt, organizationNameSnapshot: body.onlineVisit === true ? null : String(body.organizationName ?? '').trim() || null, payload: { ...payload, onlineVisit: body.onlineVisit === undefined ? payload.onlineVisit === true : body.onlineVisit === true, homeVisit: body.onlineVisit === true ? false : body.homeVisit === undefined ? payload.homeVisit === true : body.homeVisit === true, ...Object.fromEntries(['symptoms', 'diagnosis', 'exams', 'prescriptions', 'notes'].map(key => [key, String(body[key] ?? '').trim()])) } as Prisma.InputJsonValue } });
  if (!updated.count) return fail(res, 409, 'O atendimento foi atualizado ou aprovado enquanto você editava. Reabra para consultar a versão atual.');
  return res.json(await prisma.healthEvent.findUnique({ where: { id: event.id } }));
});
router.post('/professional/consultations/:id/submit', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Perfil profissional não está habilitado.');
  const event = await prisma.healthEvent.findFirst({ where: { id: req.params.id, practitionerId: practitioner.id, authoredByUserId: req.userId! } });
  if (!event) return fail(res, 404, 'Atendimento não encontrado.');
  if (!editableStatuses.includes(event.status)) return fail(res, 409, 'Este atendimento já foi aprovado e não pode ser alterado.');
  const grant = await currentClinicalGrant(req.userId!, practitioner.id, event.patientId);
  if (!grant) return fail(res, 403, 'É necessária uma autorização ativa do paciente para enviar o atendimento.');
  if (event.status === 'pending_patient_confirmation') return res.json({ id: event.id, status: event.status });
  const expected = new Date(req.body?.expectedUpdatedAt ?? event.updatedAt);
  if (Number.isNaN(expected.getTime())) return fail(res, 400, 'Versão do atendimento inválida.');
  const updated = await prisma.healthEvent.updateMany({ where: { id: event.id, authoredByUserId: req.userId!, status: { in: ['draft', 'rejected_by_patient'] }, updatedAt: expected }, data: { status: 'pending_patient_confirmation', accessGrantId: grant.id } });
  if (!updated.count) return fail(res, 409, 'O atendimento foi atualizado. Reabra antes de enviar.');
  return res.json({ id: event.id, status: 'pending_patient_confirmation' });
});
router.post('/professional/consultations/:id/documents/:documentId/inactivate', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await verifiedPractitioner(req.userId!);
  if (!practitioner) return fail(res, 403, 'Perfil profissional não está habilitado.');
  const removed = await prisma.$transaction(async tx => {
    const locked = await tx.healthEvent.updateMany({ where: { id: req.params.id, practitionerId: practitioner.id, authoredByUserId: req.userId!, status: { in: editableStatuses } }, data: { updatedAt: new Date() } });
    if (!locked.count) return false;
    const result = await tx.clinicalDocument.updateMany({ where: { id: req.params.documentId, eventId: req.params.id, status: { not: 'deleted' } }, data: { status: 'deleted' } });
    return result.count > 0;
  });
  if (!removed) return fail(res, 409, 'O anexo não pode ser removido: o atendimento foi aprovado ou o arquivo não está disponível.');
  return res.json({ status: 'deleted' });
});

router.get('/consultations/incoming', auth, async (req: AuthedRequest, res: Response) => {
  const items = await prisma.healthEvent.findMany({
    where: {
      status: 'pending_patient_confirmation',
      patient: { ownerUserId: req.userId!, archived: false },
    },
    include: { documents: { where: { status: { not: 'deleted' } }, select: { id: true, originalFilename: true } }, patient: { select: { id: true, name: true } }, practitioner: { include: { registrations: { include: { authority: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(items.map((item) => ({
    id: item.id,
    patientId: item.patientId,
    patientName: item.patient.name,
    title: item.title,
    occurredAt: item.occurredAt.toISOString(),
    organizationName: item.organizationNameSnapshot,
    onlineVisit: typeof item.payload === 'object' && item.payload !== null && !Array.isArray(item.payload) && (item.payload as Record<string, unknown>).onlineVisit === true,
    homeVisit: typeof item.payload === 'object' && item.payload !== null && !Array.isArray(item.payload) && (item.payload as Record<string, unknown>).homeVisit === true,
    profession: item.professionSnapshot,
    practitionerName: item.practitionerNameSnapshot ?? item.practitioner?.name ?? 'Profissional de saúde',
    council: item.councilSnapshot,
    registration: item.registrationSnapshot,
    region: item.registrationRegionSnapshot,
    updatedAt: item.updatedAt.toISOString(),
    documents: item.documents,
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

  const expected = new Date(req.body?.expectedUpdatedAt ?? event.updatedAt);
  if (Number.isNaN(expected.getTime())) return fail(res, 400, 'Versão do atendimento inválida.');
  const status = decision === 'confirm' ? 'final' : 'rejected_by_patient';
  const updated = await prisma.healthEvent.updateMany({
    where: { id: event.id, status: 'pending_patient_confirmation', updatedAt: expected },
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
  if (!updated.count) return fail(res, 409, 'O atendimento foi alterado ou já foi decidido. Atualize a lista e revise novamente.');
  return res.json({ id: event.id, status });
});

export default router;



