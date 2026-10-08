/**
 * My Doctor — API do portal
 * Node + Express + Prisma. Implementa o contrato legado e a API V1.
 */
import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import clinicalWorkflowRouter from './clinical-workflow.js';
import v1Router from './v1.js';
import tutorshipRouter,{createDependent} from './tutorship.js';
import {managedPatientWhere,managesPatient} from './patient-permissions.js';
import {PersonError,claimPerson,personData} from './person-identity.js';
import publicUtilityRouter from './public-utility.js';
import professionalAccessRouter from './professional-access.js';
import professionalAdminRouter from './professional-admin.js';
import medicationAgendaRouter from './medication-agenda.js';
import { startMedicationReminders } from './medication-reminders.js';

const app = express();

const PORT = Number(process.env.PORT ?? 8787);
const JWT_SECRET = process.env.JWT_SECRET ?? 'troque-este-segredo-em-producao';
const JWT_TTL = '7d';

if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET deve estar configurado com pelo menos 32 caracteres em produção.');
}

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use('/api/v1', clinicalWorkflowRouter);
app.use('/api/v1', v1Router);
app.use('/api/v1', tutorshipRouter);
app.use('/api/v1', publicUtilityRouter);
app.use('/api/v1', professionalAccessRouter);
app.use('/api/v1', medicationAgendaRouter);
app.use('/api/v1', professionalAdminRouter);

interface AuthedRequest extends Request { userId?: string; }
function sign(userId: string): string { return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: JWT_TTL }); }
function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try { req.userId = (jwt.verify(token, JWT_SECRET) as { uid: string }).uid; next(); }
  catch { res.status(401).json({ error: 'Sessão expirada ou credenciais inválidas.' }); }
}
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

app.get('/api/health', (_req, res) => { res.json({ ok: true, version: '1.2.0', release: '2026-10-08-tutorship', engine: 'mydoctor-server (Node + Prisma)', apiV1: true }); });

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !password || String(password).length < 6) return fail(res, 400, 'Informe nome, e-mail e senha com pelo menos 6 caracteres.');
  const normalized = String(email).trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email: normalized } })) return fail(res, 409, 'Este e-mail já possui conta.');
  const user = await prisma.user.create({ data: { name: String(name).trim(), email: normalized, passwordHash: await bcrypt.hash(String(password), 10) } });
  res.json({ token: sign(user.id), user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  const user = await prisma.user.findUnique({ where: { email: String(email ?? '').trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.passwordHash))) return fail(res, 401, 'E-mail ou senha incorretos.');
  res.json({ token: sign(user.id), user: { id: user.id, name: user.name, email: user.email } });
});

async function visiblePatientIds(userId: string): Promise<Set<string>> {
  const [owned, grants] = await Promise.all([
    prisma.patient.findMany({ where: managedPatientWhere(userId), select: { id: true } }),
    prisma.accessGrant.findMany({ where: { accountId: userId, permission: { not: 'read_write_consultation' }, validFrom: { lte: new Date() }, revokedAt: null, OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] }, select: { patientId: true } }),
  ]);
  return new Set([...owned, ...grants].map((x) => ('patientId' in x ? x.patientId : x.id)));
}

const toClient = (p: { id: string; record: string; archived: boolean; data: unknown }) => ({ ...(p.data as object), id: p.id, record: p.record, archived: p.archived });

app.get('/api/patients', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  const patients = await prisma.patient.findMany({ where: { id: { in: [...ids] }, archived: false }, orderBy: { updatedAt: 'desc' } });
  res.json(patients.map(toClient));
});

app.post('/api/patients',auth,async(req:AuthedRequest,res:Response)=>{try{res.status(201).json(await createDependent(req.userId!,req.body??{}))}catch(e){res.status(e instanceof PersonError?e.status:503).json({error:e instanceof PersonError?e.message:'Não foi possível incluir.'})}});
app.put('/api/patients/:id',auth,async(req:AuthedRequest,res:Response)=>{
 try{const saved=await prisma.$transaction(async tx=>{await tx.$queryRaw`SELECT id FROM "Patient" WHERE id=${req.params.id} FOR UPDATE`;const existing=await tx.patient.findUnique({where:{id:req.params.id}});if(!existing||!managesPatient(existing,req.userId!))throw new PersonError(403,'Sem acesso à ficha.');const identity=personData(req.body);await claimPerson(tx,existing.id,identity);const data={...(existing.data as any),...req.body,...identity,relationshipToOwner:(existing.data as any).relationshipToOwner,createdByUserId:(existing.data as any).createdByUserId};return tx.patient.update({where:{id:existing.id},data:{name:identity.name,data,archived:Boolean(req.body.archived??existing.archived)}})});res.json(toClient(saved))}catch(e){res.status(e instanceof PersonError?e.status:503).json({error:e instanceof PersonError?e.message:'Não foi possível atualizar.'})}
});

app.delete('/api/patients/:id', auth, async (req: AuthedRequest, res: Response) => {
  const { id } = req.params; const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing) return fail(res, 404, 'Ficha não encontrada.');
  if (!managesPatient(existing,req.userId!)) return fail(res, 403, 'Somente o dono pode arquivar.');
  res.json(toClient(await prisma.patient.update({ where: { id }, data: { archived: true } })));
});

app.post('/api/grants', auth, async (req: AuthedRequest, res: Response) => {
  const { accountId, patientId, level } = req.body ?? {}; const normalizedAccountId = String(accountId); const normalizedPatientId = String(patientId);
  const p = await prisma.patient.findUnique({ where: { id: String(patientId ?? '') } });
  if (!p || !managesPatient(p,req.userId!)) return fail(res, 403, 'Somente o dono da ficha pode delegar acesso.');
  if(String(level??'leitura')!=='leitura')return fail(res,400,'Para gestão completa, use a solicitação de tutoria.');
  const existingGrant = await prisma.accessGrant.findFirst({ where: { accountId: normalizedAccountId, patientId: normalizedPatientId } });
  const grant = existingGrant ? await prisma.accessGrant.update({ where: { id: existingGrant.id }, data: { level: String(level ?? 'completo'), revokedAt: null } }) : await prisma.accessGrant.create({ data: { accountId: normalizedAccountId, patientId: normalizedPatientId, level: String(level ?? 'completo'), grantedByName: p.name } });
  res.json(grant);
});

app.delete('/api/grants/:id', auth, async (req: AuthedRequest, res: Response) => {
  const grant = await prisma.accessGrant.findUnique({ where: { id: req.params.id } });
  if (!grant) return fail(res, 404, 'Delegação não encontrada.');
  const patient = await prisma.patient.findUnique({ where: { id: grant.patientId } });
  if (!patient || !managesPatient(patient,req.userId!)) return fail(res, 403, 'Somente o dono da ficha pode revogar.');
  await prisma.accessGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } }); res.status(204).end();
});

app.get('/api/log', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  const logs = await prisma.identificationLog.findMany({ where: { OR: [{ byUserId: req.userId! }, { patientId: { in: [...ids] } }] }, orderBy: { at: 'desc' }, take: 100 });
  res.json(logs.map((l) => ({ id: l.id, method: l.method, patientId: l.patientId, patientName: l.patientName, confidence: l.confidence, quality: l.quality, result: l.result, at: l.at.getTime(), thumb: null as string | null, detail: l.detail ?? undefined, byName: l.byName })));
});

app.post('/api/log', auth, async (req: AuthedRequest, res: Response) => {
  const b = req.body ?? {};
  const patientId=b.patientId?String(b.patientId):null;
  const ids=await visiblePatientIds(req.userId!);
  if(patientId&&!ids.has(patientId))return fail(res,403,'Sem acesso à pessoa indicada.');
  const actor=await prisma.user.findUnique({where:{id:req.userId!},select:{name:true}});
  const patient=patientId?await prisma.patient.findUnique({where:{id:patientId},select:{name:true}}):null;
  await prisma.identificationLog.create({data:{method:['face','finger'].includes(b.method)?b.method:'legacy',patientId,patientName:patient?.name??'—',byUserId:req.userId!,byName:actor?.name??'',result:'legacy_unverified',confidence:0,detail:'Registro do protótipo; identificação não validada.'}});
  res.status(201).json({ ok: true });
});

const publicDir = process.env.PUBLIC_DIR ?? path.resolve(process.cwd(), 'dist');
if (fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => { if (req.path.startsWith('/api/')) return next(); return res.sendFile(path.join(publicDir, 'index.html')); });
}

app.listen(PORT, '0.0.0.0', () => {
  startMedicationReminders();
  console.log(`My Doctor ouvindo na porta ${PORT} — saúde em /api/health — V1 em /api/v1`);
  // O schema de produção é migrado fora do processo web.
  // Nunca executar DDL pelo Prisma durante o runtime: na Hostinger isso pode
  // derrubar o query engine e interromper login/prontuário.
  console.log('My Doctor: migração de schema em runtime desativada.');
});




