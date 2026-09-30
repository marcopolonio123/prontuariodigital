import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';
import { parseSchedule } from './medication-schedule.js';
import { medicationEmailConfigured } from './email.js';

interface AuthedRequest extends Request { userId?: string; }
const router = Router();
function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    req.userId = (jwt.verify(token, process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me') as { uid: string }).uid;
    next();
  } catch { res.status(401).json({ error: 'Entre na sua conta para acessar a agenda.' }); }
}
export function grantAllowsMedication(scope: unknown) {
  return scope == null || (Array.isArray(scope) && (scope.includes('record') || scope.includes('medications')));
}
export async function medicationRecipients(patientId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { ownerUserId: true } });
  if (!patient) return [];
  const now = new Date();
  const grants = await prisma.accessGrant.findMany({ where: { patientId, practitionerId: null, revokedAt: null, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, select: { accountId: true, scope: true } });
  const ids = [patient.ownerUserId, ...grants.filter(grant => grantAllowsMedication(grant.scope)).map(grant => grant.accountId)];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true, emailVerifiedAt: true, role: true,
    challenges: { where: { channel: 'email', consumedAt: { not: null } }, select: { destination: true } } } });
  return users.filter(user => (user.id === patient.ownerUserId || user.role !== 'profissional') && (user.emailVerifiedAt || user.challenges.some(challenge => challenge.destination.toLowerCase() === user.email.toLowerCase())));
}
async function accessible(patientId: string, userId: string) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.archived) return null;
  if (patient.ownerUserId === userId) return patient;
  const now = new Date();
  const grants = await prisma.accessGrant.findMany({ where: { patientId, accountId: userId, revokedAt: null, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }] }, select: { scope: true } });
  return grants.some(grant => grantAllowsMedication(grant.scope)) ? patient : null;
}
router.get('/patients/:patientId/medications', auth, async (req: AuthedRequest, res: Response) => {
  const patient = await accessible(req.params.patientId, req.userId!);
  if (!patient) return res.status(403).json({ error: 'Você não tem acesso a esta agenda.' });
  const schedules = await prisma.medicationSchedule.findMany({ where: { patientId: patient.id, active: true }, orderBy: { createdAt: 'asc' } });
  const recipients = await medicationRecipients(patient.id);
  res.json({ schedules, alertsEnabled: patient.medicationAlertsEnabled, canEdit: patient.ownerUserId === req.userId,
    deliveryAvailable: process.env.NODE_ENV === 'production' && process.env.MEDICATION_REMINDERS_ENABLED === 'true' && medicationEmailConfigured(),
    recipients: recipients.map(user => ({ id: user.id, name: user.name, emailMasked: user.email.replace(/^(.).+(@.*)$/, '$1***$2'), owner: user.id === patient.ownerUserId })) });
});
router.put('/patients/:patientId/medications/alerts', auth, async (req: AuthedRequest, res: Response) => {
  const patient = await accessible(req.params.patientId, req.userId!);
  if (!patient || patient.ownerUserId !== req.userId) return res.status(403).json({ error: 'Somente o titular/responsável pelo cadastro pode alterar os avisos.' });
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ error: 'Informe se os avisos estão ligados ou desligados.' });
  await prisma.patient.update({ where: { id: patient.id }, data: { medicationAlertsEnabled: req.body.enabled } });
  res.json({ alertsEnabled: req.body.enabled });
});
async function save(req: AuthedRequest, res: Response) {
  const patient = await accessible(req.params.patientId, req.userId!);
  if (!patient || patient.ownerUserId !== req.userId) return res.status(403).json({ error: 'Somente o titular/responsável pelo cadastro pode alterar a agenda.' });
  try {
    const input = parseSchedule(req.body);
    const recipients = await medicationRecipients(patient.id);
    if (input.recipientIds.some(id => !recipients.some(user => user.id === id))) return res.status(400).json({ error: 'Escolha pessoas com acesso vigente a este perfil e e-mail confirmado.' });
    if (req.params.scheduleId) {
      const current = await prisma.medicationSchedule.findFirst({ where: { id: req.params.scheduleId, patientId: patient.id, active: true } });
      if (!current) return res.status(404).json({ error: 'Agenda não encontrada.' });
      if (req.body.expectedUpdatedAt !== current.updatedAt.toISOString()) return res.status(409).json({ error: 'A agenda mudou. Atualize a tela antes de editar.' });
      const result = await prisma.medicationSchedule.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: input });
      if (!result.count) return res.status(409).json({ error: 'A agenda mudou. Atualize a tela.' });
      return res.json(await prisma.medicationSchedule.findUnique({ where: { id: current.id } }));
    }
    if (await prisma.medicationSchedule.count({ where: { patientId: patient.id, active: true } }) >= 50) return res.status(400).json({ error: 'Este perfil atingiu o limite de 50 agendas ativas.' });
    return res.status(201).json(await prisma.medicationSchedule.create({ data: { ...input, patientId: patient.id } }));
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Dados da agenda inválidos.' }); }
}
router.post('/patients/:patientId/medications', auth, save);
router.put('/patients/:patientId/medications/:scheduleId', auth, save);
router.delete('/patients/:patientId/medications/:scheduleId', auth, async (req: AuthedRequest, res: Response) => {
  const patient = await accessible(req.params.patientId, req.userId!);
  if (!patient || patient.ownerUserId !== req.userId) return res.status(403).json({ error: 'Somente o titular/responsável pode remover esta agenda.' });
  const result = await prisma.medicationSchedule.updateMany({ where: { id: req.params.scheduleId, patientId: patient.id, active: true }, data: { active: false, alertsEnabled: false } });
  return result.count ? res.json({ ok: true }) : res.status(404).json({ error: 'Agenda não encontrada.' });
});
export default router;
