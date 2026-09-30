import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from './db.js';

interface AdminRequest extends Request { actor?: { id: string; name: string }; }
const router = Router();
async function administrator(req: AdminRequest) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const { uid } = jwt.verify(token, process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me') as { uid: string };
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true, email: true, emailVerifiedAt: true,
    challenges: { where: { channel: 'email', consumedAt: { not: null } }, select: { destination: true } } } });
  if (!user) throw new Error('AUTH');
  const admins = (process.env.MYDOCTOR_ADMIN_EMAILS ?? '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  const confirmed = user.emailVerifiedAt || user.challenges.some(item => item.destination.toLowerCase() === user.email.toLowerCase());
  return { user, authorized: Boolean(confirmed && admins.includes(user.email.toLowerCase())) };
}
async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const result = await administrator(req);
    if (!result.authorized) return res.status(403).json({ error: 'Acesso restrito à administração.' });
    req.actor = result.user; next();
  } catch { res.status(401).json({ error: 'Entre na sua conta para continuar.' }); }
}
router.get('/admin/session', async (req: AdminRequest, res: Response) => {
  try { res.json({ authorized: (await administrator(req)).authorized }); }
  catch { res.status(401).json({ error: 'Entre na sua conta para continuar.' }); }
});
router.get('/admin/professionals', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    const professionals = await prisma.practitioner.findMany({ where: { userId: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 200,
      include: { user: { select: { email: true } }, registrations: { include: { authority: true } }, verificationDecisions: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    res.json(professionals.map(item => ({ id: item.id, name: item.name, email: item.user?.email, profession: item.profession, specialty: item.specialty,
      verificationStatus: item.verificationStatus, active: item.active, updatedAt: item.updatedAt.toISOString(),
      registrations: item.registrations.map(reg => ({ id: reg.id, council: reg.authority.code, registration: reg.registration, region: reg.region, status: reg.status })),
      history: item.verificationDecisions.map(decision => ({ id: decision.id, decision: decision.decision, status: decision.status, actorName: decision.actorName, note: decision.note, evidence: decision.evidence, createdAt: decision.createdAt.toISOString() })) })));
  } catch { res.status(503).json({ error: 'A análise de profissionais está indisponível. Tente novamente.' }); }
});
router.post('/admin/professionals/:id/decision', requireAdmin, async (req: AdminRequest, res: Response) => {
  const decision = String(req.body?.decision ?? '');
  const note = String(req.body?.note ?? '').trim();
  const evidence = String(req.body?.evidence ?? '').trim();
  const expectedUpdatedAt = String(req.body?.expectedUpdatedAt ?? '');
  if (!['approve', 'reject', 'suspend'].includes(decision) || note.length < 5 || note.length > 2000 || evidence.length > 2000) {
    return res.status(400).json({ error: 'Escolha uma decisão e registre um motivo de 5 a 2.000 caracteres.' });
  }
  if (decision === 'approve' && (req.body?.checkedIdentityAndCouncil !== true || evidence.length < 5)) {
    return res.status(400).json({ error: 'Confira a identidade e o conselho e registre a fonte da conferência antes de aprovar.' });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      const current = await tx.practitioner.findUnique({ where: { id: req.params.id }, include: { registrations: { include: { authority: true } } } });
      if (!current) throw new Error('NOT_FOUND');
      if (current.userId === req.actor!.id) throw new Error('SELF_REVIEW');
      if (current.updatedAt.toISOString() !== expectedUpdatedAt) throw new Error('STALE');
      const registration = current.registrations.find(reg => reg.id === req.body?.registrationId);
      if (decision === 'approve' && !registration) throw new Error('REGISTRATION');
      const status = decision === 'approve' ? 'verified' : decision === 'reject' ? 'rejected' : 'suspended';
      const now = new Date();
      const updated = await tx.practitioner.updateMany({ where: { id: current.id, updatedAt: current.updatedAt }, data: { verificationStatus: status, active: decision === 'approve', verifiedAt: decision === 'approve' ? now : null } });
      if (!updated.count) throw new Error('STALE');
      await tx.professionalRegistration.updateMany({ where: { practitionerId: current.id }, data: { status: decision === 'suspend' ? 'suspended' : 'unknown', verifiedAt: null } });
      if (decision === 'approve') await tx.professionalRegistration.update({ where: { id: registration!.id }, data: { status: 'active', verifiedAt: now, verificationSource: 'mydoctor_admin_manual' } });
      // Revalidações exigem uma nova autorização do paciente; não reativar grants antigos.
      await tx.accessGrant.updateMany({ where: { practitionerId: current.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.accessRequest.updateMany({ where: { practitionerId: current.id, status: { in: ['pending', 'approved'] } }, data: { status: 'revoked' } });
      await tx.professionalVerificationDecision.create({ data: { practitionerId: current.id, actorUserId: req.actor!.id, actorName: req.actor!.name,
        decision, previousStatus: current.verificationStatus, status, note, evidence: evidence || null,
        registrationSnapshot: current.registrations.map(reg => ({ council: reg.authority.code, registration: reg.registration, region: reg.region, selected: reg.id === registration?.id })) } });
      return { status };
    });
    res.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return res.status(404).json({ error: 'Profissional não encontrado.' });
    if (code === 'SELF_REVIEW') return res.status(403).json({ error: 'Você não pode validar seu próprio perfil profissional.' });
    if (code === 'STALE') return res.status(409).json({ error: 'O cadastro mudou. Atualize a lista e revise os dados novamente.' });
    if (code === 'REGISTRATION') return res.status(400).json({ error: 'Selecione o registro profissional conferido.' });
    res.status(503).json({ error: 'Não foi possível registrar a decisão. Nenhuma aprovação foi confirmada.' });
  }
});
export default router;
