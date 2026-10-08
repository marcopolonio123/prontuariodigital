import { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import prisma from './db.js';
import { isUnder18 } from './identity-policy.js';

interface AdminRequest extends Request { actor?: { id: string; name: string }; }
const router = Router();
export async function administrator(req: AdminRequest) {
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
const documentSelect = { id: true, kind: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true } as const;
interface OwnerRequest extends Request { userId?: string; }
function requireOwner(req: OwnerRequest, res: Response, next: NextFunction) {
  try { req.userId = (jwt.verify((req.headers.authorization ?? '').replace(/^Bearer /, ''), process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me') as { uid: string }).uid; next(); }
  catch { res.status(401).json({ error: 'Entre na sua conta para continuar.' }); }
}
export async function invalidate(tx: any, practitioner: any) {
  const changed = await tx.practitioner.updateMany({ where: { id: practitioner.id, updatedAt: practitioner.updatedAt }, data: { updatedAt: new Date(), verificationStatus: practitioner.verificationStatus === 'suspended' ? 'suspended' : 'pending', verifiedAt: null } });
  if (!changed.count) throw new Error('STALE');
  await tx.accessGrant.updateMany({ where: { practitionerId: practitioner.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.accessRequest.updateMany({ where: { practitionerId: practitioner.id, status: { in: ['pending', 'approved'] } }, data: { status: 'revoked' } });
}
export function validatedUpload(body: any) {
  const { mimeType, data } = body ?? {};
  const filename = String(body?.filename ?? '').replace(/[\\/\r\n\x00-\x1f]/g, '_').slice(0, 180);
  if (!filename || typeof data !== 'string' || data.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const content = Buffer.from(data, 'base64');
  const magic = mimeType === 'application/pdf' ? content.subarray(0, 5).toString() === '%PDF-' : mimeType === 'image/jpeg' ? content[0] === 255 && content[1] === 216 && content[2] === 255 : mimeType === 'image/png' ? content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mimeType === 'image/webp' ? content.subarray(0,4).toString() === 'RIFF' && content.subarray(8,12).toString() === 'WEBP' : false;
  if (!magic || content.length > 3 * 1024 * 1024) return null;
  return { filename, mimeType: String(mimeType), sizeBytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex'), content };
}
router.get('/account/document', requireOwner, async (req: OwnerRequest, res: Response) => {
  try { res.json(await prisma.userIdentityDocument.findUnique({ where: { userId: req.userId! }, select: documentSelect })); }
  catch { res.status(503).json({ error: 'Não foi possível carregar seu documento.' }); }
});
router.post('/account/document', requireOwner, async (req: OwnerRequest, res: Response) => {
  const kind = req.body?.kind; const file = validatedUpload(req.body);
  if (!['CNH', 'RG', 'Passaporte', 'Certidão de nascimento'].includes(kind) || !file) return res.status(400).json({ error: 'Selecione CNH, RG, passaporte ou certidão de nascimento e um PDF ou imagem de até 3 MB.' });
  try {
    const result = await prisma.$transaction(async tx => {
      const user = await tx.user.update({ where: { id: req.userId! }, data: { updatedAt: new Date() }, select: { accountData: true } });
      if (kind === 'Certidão de nascimento' && !isUnder18((user.accountData as any)?.birthDate ?? '')) throw new Error('AGE');
      const old = await tx.userIdentityDocument.findUnique({ where: { userId: req.userId! } });
      if ((old?.id ?? null) !== (req.body?.expectedId ?? null)) throw new Error('STALE');
      const professional = await tx.practitioner.findUnique({ where: { userId: req.userId! } });
      if (professional) await invalidate(tx, professional);
      if (old) await tx.userIdentityDocument.delete({ where: { id: old.id } });
      return tx.userIdentityDocument.create({ data: { userId: req.userId!, kind, ...file }, select: documentSelect });
    });
    res.status(201).json(result);
  } catch (error) { const code = error instanceof Error ? error.message : ''; res.status(code === 'AGE' ? 400 : code === 'STALE' ? 409 : 503).json({ error: code === 'AGE' ? 'Certidão de nascimento é permitida somente para menores de 18 anos. Confira a data de nascimento.' : 'Não foi possível salvar o documento. Atualize o cadastro e tente novamente.' }); }
});
router.delete('/account/documents/:id', requireOwner, async (req: OwnerRequest, res: Response) => {
  try {
    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: req.userId! }, data: { updatedAt: new Date() } });
      const doc = await tx.userIdentityDocument.findFirst({ where: { id: req.params.id, userId: req.userId! } });
      if (!doc) throw new Error('NOT_FOUND');
      const professional = await tx.practitioner.findUnique({ where: { userId: req.userId! } });
      if (professional) await invalidate(tx, professional);
      await tx.userIdentityDocument.delete({ where: { id: doc.id } });
    }); res.json({ ok: true });
  } catch (error) { res.status(error instanceof Error && error.message === 'NOT_FOUND' ? 404 : 409).json({ error: 'Documento não encontrado ou cadastro alterado. Atualize a página.' }); }
});
async function downloadIdentity(req: OwnerRequest, res: Response, admin: boolean) {
  try {
    const doc = await prisma.userIdentityDocument.findFirst({ where: { id: req.params.id, ...(admin ? { user: { practitioner: { isNot: null } } } : { userId: req.userId! }) } });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);
    res.type(doc.mimeType).send(Buffer.from(doc.content));
  } catch { res.status(503).json({ error: 'Não foi possível abrir o documento.' }); }
}
router.get('/account/documents/:id/download', requireOwner, (req: OwnerRequest, res: Response) => { void downloadIdentity(req, res, false); });
router.get('/admin/account/documents/:id/download', requireAdmin, (req: AdminRequest, res: Response) => { void downloadIdentity(req, res, true); });

router.get('/professional/documents', requireOwner, async (req: OwnerRequest, res: Response) => {
  try {
    const docs = await prisma.professionalVerificationDocument.findMany({ where: { practitioner: { userId: req.userId! } }, select: documentSelect, orderBy: { createdAt: 'desc' } });
    const identity = await prisma.userIdentityDocument.findUnique({ where: { userId: req.userId! }, select: documentSelect });
    res.json([...docs, ...(identity ? [{ ...identity, id: 'account:' + identity.id, kind: 'identity' }] : [])]);
  }
  catch { res.status(503).json({ error: 'Não foi possível carregar os documentos.' }); }
});
router.post('/professional/documents', requireOwner, async (req: OwnerRequest, res: Response) => {
  const kind = req.body?.kind; const file = validatedUpload(req.body);
  if (!['identity','council'].includes(kind) || !file) return res.status(400).json({ error: 'Use PDF, JPG, PNG ou WEBP de até 3 MB e selecione identidade ou conselho.' });
  try {
    const result = await prisma.$transaction(async tx => {
      const practitioner = await tx.practitioner.findUnique({ where: { userId: req.userId! } });
      if (!practitioner) throw new Error('PROFILE');
      await invalidate(tx, practitioner);
      if (await tx.professionalVerificationDocument.count({ where: { practitionerId: practitioner.id } }) >= 6) throw new Error('LIMIT');
      return tx.professionalVerificationDocument.create({ data: { practitionerId: practitioner.id, kind, ...file }, select: documentSelect });
    });
    res.status(201).json(result);
  } catch (error) { const code = error instanceof Error ? error.message : ''; res.status(code === 'STALE' ? 409 : ['PROFILE','LIMIT'].includes(code) ? 400 : 503).json({ error: code === 'PROFILE' ? 'Salve os dados profissionais antes de anexar documentos.' : code === 'LIMIT' ? 'Limite de 6 documentos. Remova um antes de enviar outro.' : code === 'STALE' ? 'O cadastro mudou. Atualize e tente novamente.' : 'Não foi possível enviar o documento.' }); }
});
router.delete('/professional/documents/:id', requireOwner, async (req: OwnerRequest, res: Response) => {
  try {
    await prisma.$transaction(async tx => {
      const doc = await tx.professionalVerificationDocument.findFirst({ where: { id: req.params.id, practitioner: { userId: req.userId! } }, include: { practitioner: true } });
      if (!doc) throw new Error('NOT_FOUND');
      await invalidate(tx, doc.practitioner);
      await tx.professionalVerificationDocument.delete({ where: { id: doc.id } });
    });
    res.json({ ok: true });
  } catch (error) { res.status(error instanceof Error && error.message === 'NOT_FOUND' ? 404 : 409).json({ error: 'Documento não encontrado ou cadastro alterado. Atualize a página.' }); }
});
async function downloadDocument(req: OwnerRequest, res: Response, admin: boolean) {
  try {
    const doc = await prisma.professionalVerificationDocument.findFirst({ where: { id: req.params.id, ...(admin ? {} : { practitioner: { userId: req.userId! } }) } });
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado.' });
    res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);
    res.type(doc.mimeType).send(Buffer.from(doc.content));
  } catch { res.status(503).json({ error: 'Não foi possível abrir o documento.' }); }
}
router.get('/professional/documents/:id/download', requireOwner, (req: OwnerRequest, res: Response) => { void downloadDocument(req, res, false); });
router.get('/admin/documents/:id/download', requireAdmin, (req: AdminRequest, res: Response) => { void downloadDocument(req, res, true); });

router.get('/admin/professionals', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    const professionals = await prisma.practitioner.findMany({ where: { userId: { not: null } }, orderBy: { updatedAt: 'desc' }, take: 200,
      include: { user: { select: { email: true, identityDocument: { select: documentSelect } } }, registrations: { include: { authority: true } }, verificationDocuments: { select: documentSelect, orderBy: { createdAt: 'desc' } }, verificationDecisions: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    res.json(professionals.map(item => ({ id: item.id, name: item.name, email: item.user?.email, profession: item.profession, specialty: item.specialty,
      verificationStatus: item.verificationStatus, active: item.active, updatedAt: item.updatedAt.toISOString(),
      documents: [...item.verificationDocuments, ...(item.user?.identityDocument ? [{ ...item.user.identityDocument, id: 'account:' + item.user.identityDocument.id, kind: 'identity' }] : [])],
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

