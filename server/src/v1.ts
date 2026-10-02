import { randomInt, randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from './db.js';
import { purgeExpiredDiary, retainedDiaryEntries } from './diary-retention.js';
import { consultantPolicy, getConsultantUsage, reserveConsultantResponse, completeConsultantResponse, releaseConsultantResponse } from './consultant-usage.js';
import { validCpf, normalizeCpf, normalizeRg, rgError, BRAZIL_UFS } from './document-validation.js';
import { isUnder18 } from './identity-policy.js';
import { prepareReference, referenceMetadata } from './fingerprint-reference.js';
import { sendLoginVerificationEmail } from './email.js';

const router = Router();
const DOCUMENT_ROOT = path.resolve(process.env.DOCUMENT_STORAGE_PATH ?? path.join(process.cwd(), 'private-documents'));
if (process.env.NODE_ENV === 'production' && !process.env.DOCUMENT_STORAGE_PATH) {
  console.warn('My Doctor: DOCUMENT_STORAGE_PATH não configurado; uploads clínicos permanecerão desabilitados até configurar um diretório privado persistente.');
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});
const documentCategories = new Set(['report', 'prescription', 'exam']);

async function ensureDocumentRoot() {
  if (process.env.NODE_ENV === 'production' && !process.env.DOCUMENT_STORAGE_PATH) {
    throw new Error('DOCUMENT_STORAGE_PATH não configurado em produção.');
  }
  await fs.mkdir(DOCUMENT_ROOT, { recursive: true });
  await fs.access(DOCUMENT_ROOT);
}
function safeObjectPath(objectKey: string) {
  const resolved = path.resolve(DOCUMENT_ROOT, objectKey);
  if (!resolved.startsWith(DOCUMENT_ROOT + path.sep)) throw new Error('Caminho de documento inválido.');
  return resolved;
}
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-mydoctor-jwt-secret-change-me';
const JWT_TTL = '7d';
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES ?? 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);

const PROFESSIONAL_COUNCILS: Record<string, string> = {
  CRM: 'Conselho Regional de Medicina',
  CREFITO: 'Conselho Regional de Fisioterapia e Terapia Ocupacional',
  CRN: 'Conselho Regional de Nutricionistas',
  COREN: 'Conselho Regional de Enfermagem',
  CRO: 'Conselho Regional de Odontologia',
  OUTROS: 'Outro conselho profissional',
};

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

export async function visiblePatientIds(userId: string, includeProfessional = false): Promise<Set<string>> {
  const [owned, grants] = await Promise.all([
    prisma.patient.findMany({ where: { ownerUserId: userId, archived: false }, select: { id: true } }),
    prisma.accessGrant.findMany({
      where: {
        accountId: userId,
        ...(includeProfessional ? {} : { permission: { not: 'read_write_consultation' } }),
        validFrom: { lte: new Date() },
        patient: { archived: false },
        revokedAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      select: { patientId: true },
    }),
  ]);
  return new Set([...owned.map((p) => p.id), ...grants.map((g) => g.patientId)]);
}

async function ownedProfessionalEvent(req: AuthedRequest) {
  return prisma.healthEvent.findFirst({ where: { id: req.params.eventId, patientId: req.params.patientId, authoredByUserId: req.userId!, practitioner: { userId: req.userId!, active: true, verificationStatus: 'verified' }, status: { in: ['draft', 'pending_patient_confirmation', 'final', 'rejected_by_patient', 'amended', 'cancelled'] } } });
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
            isHealthProfessional: body.isHealthProfessional === true,
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
  console.info('V1 login checkpoint: start', { emailDomain: normalized.split('@')[1] ?? 'invalid' });
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  console.info('V1 login checkpoint: user lookup complete', { found: Boolean(user) });
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.passwordHash))) {
    return fail(res, 401, 'E-mail ou senha incorretos.');
  }

  console.info('V1 login checkpoint: password verified');
  const selectedChannel = String(channel) === 'sms' ? 'sms' : 'email';
  const destination = selectedChannel === 'sms' ? user.phone : user.email;
  if (!destination) {
    return fail(res, 400, selectedChannel === 'sms' ? 'Nenhum celular cadastrado para este usuário.' : 'Nenhum e-mail cadastrado.');
  }

  if (selectedChannel === 'sms') {
    return fail(res, 501, 'Envio por SMS ainda não está habilitado. Selecione e-mail para receber o código.');
  }

  const code = randomCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  console.info('V1 login checkpoint: creating MFA challenge');
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

  console.info('V1 login checkpoint: MFA transaction complete');
  const challenge = await prisma.verificationChallenge.findFirst({
    where: { userId: user.id, purpose: 'login', channel: selectedChannel, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return fail(res, 500, 'Não foi possível iniciar a verificação.');

  console.info('V1 login checkpoint: challenge loaded', { found: Boolean(challenge) });
  try {
    console.info('V1 login checkpoint: sending MFA email');
    await sendLoginVerificationEmail({
      to: destination,
      code,
      expiresInMinutes: OTP_TTL_MINUTES,
    });
  } catch (error) {
    console.error('V1 MFA email error', error);
    await prisma.verificationChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return fail(res, 503, 'Não foi possível enviar o código por e-mail agora. Tente novamente em instantes.');
  }

  console.info('V1 login checkpoint: MFA email sent');
  const developmentCode = process.env.NODE_ENV === 'production' ? undefined : code;

  return res.json({
    challengeId: challenge.id,
    channel: selectedChannel,
    destinationMasked: maskEmail(destination),
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

function accountView(user: { id: string; name: string; email: string; phone: string | null }, data: any) {
  return { fingerprintReference: referenceMetadata(data?.fingerprintReference), id: user.id, name: user.name, email: user.email, phone: user.phone,
    rgUf: data?.rgUf ?? '', rgType: data?.rgType ?? 'RG', avatarDataUrl: data?.avatarDataUrl ?? '', cpf: data?.cpf ?? '', rg: data?.rg ?? '', postalCode: data?.postalCode ?? '', street: data?.street ?? '', number: data?.number ?? '', complement: data?.complement ?? '', neighborhood: data?.neighborhood ?? '', country: data?.country ?? 'Brasil',
    birthDate: data?.birthDate ?? '', sex: data?.sex ?? '', city: data?.city ?? '', state: data?.state ?? '', isHealthProfessional: data?.isHealthProfessional === true, completed: Boolean(data?.accountCompletedAt) };
}
router.get('/address/cep/:cep', auth, async (req: AuthedRequest, res: Response) => {
  const cep = req.params.cep;
  if (!/^\d{8}$/.test(cep)) return fail(res, 400, 'Informe um CEP com 8 números.');
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return fail(res, 503, 'Consulta de CEP indisponível. Preencha o endereço manualmente.');
    const address = await response.json() as Record<string, unknown>;
    if (address.erro) return res.json({ erro: true });
    if (typeof address.localidade !== 'string' || typeof address.uf !== 'string' || !/^[A-Z]{2}$/.test(address.uf) || String(address.cep ?? '').replace(/\D/g, '') !== cep) return fail(res, 503, 'Consulta de CEP indisponível.');
    res.json({ cep: address.cep, logradouro: String(address.logradouro ?? '').slice(0,180), bairro: String(address.bairro ?? '').slice(0,100), localidade: address.localidade.slice(0,100), uf: address.uf });
  } catch { fail(res, 503, 'Consulta de CEP indisponível. Preencha o endereço manualmente.'); }
});
router.get('/account', auth, async (req: AuthedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, name: true, email: true, phone: true, accountData: true } });
    if (!user) return fail(res, 401, 'Entre novamente.');
    const patients = await prisma.patient.findMany({ where: { ownerUserId: user.id, archived: false }, select: { data: true } });
    const self = patients.find(p => (p.data as any)?.relationshipToOwner === 'self');
    const practitioner = await prisma.practitioner.findUnique({ where: { userId: user.id }, select: { id: true } });
    const data = { ...((self?.data as object) ?? {}), ...((user.accountData as object) ?? {}) };
    res.json({ ...accountView(user, data), isHealthProfessional: typeof (data as any).isHealthProfessional === 'boolean' ? (data as any).isHealthProfessional : Boolean(practitioner) });
  } catch { fail(res, 503, 'Não foi possível carregar seu cadastro.'); }
});
router.put('/account', auth, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const name = String(body.name ?? '').trim(); const phone = String(body.phone ?? '').trim().replace(/[().\s-]/g, '') || null;
  const birthDate = String(body.birthDate ?? '').trim();
  const rawSex = String(body.sex ?? '').trim().toLowerCase();
  const sex = ({ feminino: 'female', f: 'female', masculino: 'male', m: 'male', outro: 'other', 'não informado': '', 'nao informado': '' } as Record<string, string>)[rawSex] ?? rawSex;
  const city = String(body.city ?? '').trim(); const state = String(body.state ?? '').trim().toUpperCase();
  const cpf = normalizeCpf(String(body.cpf ?? ''));
  const rg = normalizeRg(String(body.rg ?? ''));
  const rgType = String(body.rgType ?? 'RG').toUpperCase(); const rgUf = String(body.rgUf ?? '').trim().toUpperCase();
  if (!['RG','CIN'].includes(rgType) || (rgUf && !BRAZIL_UFS.includes(rgUf))) return fail(res, 400, 'Confira o tipo e a UF emissora do documento.');
  const rgValidation = rgError(String(body.rg ?? ''), rgUf, rgType);
  if (rgValidation) return fail(res, 400, rgValidation);
  const postalCode = String(body.postalCode ?? '').trim().replace(/[\s-]/g, '');
  const address = { postalCode, street: String(body.street ?? '').trim(), number: String(body.number ?? '').trim(), complement: String(body.complement ?? '').trim(), neighborhood: String(body.neighborhood ?? '').trim(), country: String(body.country ?? 'Brasil').trim() || 'Brasil' };
  if (cpf && !validCpf(cpf)) return fail(res, 400, 'CPF inválido: confira os 11 números e os dois dígitos verificadores.');
  if (rg && rgType === 'CIN' && cpf && rg !== cpf) return fail(res, 400, 'Os dois campos de CPF devem conter o mesmo número.');
  if (rg.length > 30 || (postalCode && !/^\d{8}$/.test(postalCode)) || address.street.length > 180 || address.number.length > 20 || address.complement.length > 100 || address.neighborhood.length > 100 || address.country.length > 80) return fail(res, 400, 'Confira RG, CEP e endereço.');
  const avatar = String(body.avatarDataUrl ?? '');
  if (avatar && (avatar.length > 256 * 1024 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))) return fail(res, 400, 'Selecione uma foto ou avatar válido.');
  if (avatar) { const bytes = Buffer.from(avatar.split(',')[1], 'base64'); if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return fail(res, 400, 'Imagem de perfil inválida.'); }
  const date = new Date(birthDate + 'T00:00:00Z');
  if (name.length < 2 || name.length > 150) return fail(res, 400, 'Nome completo: informe entre 2 e 150 caracteres.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate || date > new Date() || date.getUTCFullYear() < 1900) return fail(res, 400, 'Data de nascimento inválida: informe uma data real, de 1900 até hoje.');
  if (!['', 'female', 'male', 'other', 'unknown'].includes(sex)) return fail(res, 400, 'Sexo: selecione uma das opções disponíveis.');
  if (city.length > 100) return fail(res, 400, 'Cidade: use no máximo 100 caracteres.');
  if (state && !BRAZIL_UFS.includes(state)) return fail(res, 400, 'UF do endereço: selecione um estado na lista.');
  if (phone && !/^\+?\d{8,15}$/.test(phone)) return fail(res, 400, 'Celular inválido: informe DDD e número, com código do país opcional.');
  const referenceChanged=Object.prototype.hasOwnProperty.call(body,'fingerprintReference');
  let reference:any;
  try{if(referenceChanged)reference=prepareReference(body.fingerprintReference,req.userId!)}catch(e){return fail(res,400,e instanceof Error?e.message:'Foto da digital inválida.')}
  try {
    const result = await prisma.$transaction(async tx => {
      const old = await tx.user.update({ where: { id: req.userId! }, data: { updatedAt: new Date() } });
      const identity = await tx.userIdentityDocument.findUnique({ where: { userId: old.id }, select: { kind: true } });
      if (identity?.kind === 'Certidão de nascimento' && !isUnder18(birthDate)) throw new Error('AGE');
      const user = await tx.user.update({ where: { id: old.id }, data: { name, phone, accountData: { ...((old.accountData as object) ?? {}), ...(referenceChanged?{fingerprintReference:reference}:{}), ...address, cpf, rg, rgType, rgUf: rgType === 'CIN' ? '' : rgUf, avatarDataUrl: avatar, birthDate, sex, city, state, isHealthProfessional: body.isHealthProfessional === true, accountCompletedAt: new Date().toISOString() }, ...(old.phone !== phone ? { phoneVerifiedAt: null } : {}) }, select: { id: true, name: true, email: true, phone: true, accountData: true } });
      const patients = await tx.patient.findMany({ where: { ownerUserId: old.id, archived: false }, select: { id: true, data: true } });
      const self = patients.find(p => (p.data as any)?.relationshipToOwner === 'self');
      const data = { ...((self?.data as object) ?? {}), name, birthDate, sex, city, state, relationshipToOwner: 'self', isHealthProfessional: body.isHealthProfessional === true, accountCompletedAt: new Date().toISOString() };
      if (self) await tx.patient.update({ where: { id: self.id }, data: { name, data } });
      else await tx.patient.create({ data: { id: randomUUID(), ownerUserId: old.id, name, data } });
      if(referenceChanged)await tx.identificationLog.create({data:{method:'reference',byUserId:old.id,byName:name,result:reference?'reference_registered':'reference_removed',detail:'Foto de referência do piloto; comparação biométrica não ativada.'}});
      if (old.name !== name || ((old.accountData as any)?.cpf ?? '') !== cpf || normalizeRg(String((old.accountData as any)?.rg ?? '')) !== rg || ((old.accountData as any)?.rgUf ?? '') !== (rgType === 'CIN' ? '' : rgUf) || ((old.accountData as any)?.rgType ?? 'RG') !== rgType || ((old.accountData as any)?.birthDate ?? birthDate) !== birthDate) {
        const practitioner = await tx.practitioner.findUnique({ where: { userId: old.id } });
        if (practitioner) {
          await tx.practitioner.update({ where: { id: practitioner.id }, data: { name, verificationStatus: practitioner.verificationStatus === 'suspended' ? 'suspended' : 'pending', verifiedAt: null } });
          await tx.accessGrant.updateMany({ where: { practitionerId: practitioner.id, revokedAt: null }, data: { revokedAt: new Date() } });
          await tx.accessRequest.updateMany({ where: { practitionerId: practitioner.id, status: { in: ['pending', 'approved'] } }, data: { status: 'revoked' } });
        }
      }
      return accountView(user, { ...data, ...(user.accountData as object) });
    });
    res.json(result);
  } catch (error: any) { if (error?.message === 'AGE') return fail(res, 400, 'Remova ou substitua a certidão de nascimento antes de informar uma idade de 18 anos ou mais.'); fail(res, error?.code === 'P2002' ? 409 : 503, error?.code === 'P2002' ? 'Celular já cadastrado em outra conta.' : 'Não foi possível salvar seu cadastro.'); }
});

/** Perfil profissional opcional da mesma conta. A conta continua sendo paciente normalmente. */
router.get('/professional/profile', auth, async (req: AuthedRequest, res: Response) => {
  const practitioner = await prisma.practitioner.findUnique({
    where: { userId: req.userId! },
    include: { registrations: { include: { authority: true } } },
  });
  if (!practitioner) return res.json(null);

  return res.json({
    id: practitioner.id,
    name: practitioner.name,
    profession: practitioner.profession,
    specialty: practitioner.specialty,
    verificationStatus: practitioner.verificationStatus,
    verifiedAt: practitioner.verifiedAt?.toISOString() ?? null,
    active: practitioner.active,
    registrations: practitioner.registrations.map((item) => ({
      id: item.id,
      council: item.authority.code,
      councilName: item.authority.name,
      registration: item.registration,
      region: item.region,
      status: item.status,
      verifiedAt: item.verifiedAt?.toISOString() ?? null,
    })),
  });
});

/**
 * Solicita habilitação profissional. Nesta fase o cadastro fica EM VALIDAÇÃO:
 * nenhuma funcionalidade de Clinicar é liberada até verificationStatus === verified.
 */
router.put('/professional/profile', auth, async (req: AuthedRequest, res: Response) => {
  const body = req.body ?? {};
  const profession = String(body.profession ?? '').trim();
  const specialty = String(body.specialty ?? '').trim() || null;
  const council = String(body.council ?? '').trim().toUpperCase();
  const registration = String(body.registration ?? '').trim().replace(/\s+/g, '');
  const region = String(body.region ?? '').trim().toUpperCase();

  if (!profession) return fail(res, 400, 'Informe sua profissão.');
  if (!Object.prototype.hasOwnProperty.call(PROFESSIONAL_COUNCILS, council)) return fail(res, 400, 'Selecione um conselho profissional válido.');
  if (!registration) return fail(res, 400, 'Informe o número do registro profissional.');
  if (council !== 'OUTROS' && !/^[A-Z]{2}$/.test(region)) return fail(res, 400, 'Informe a UF do registro profissional.');

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, name: true } });
  if (!user) return fail(res, 404, 'Usuário não encontrado.');

  try {
    const result = await prisma.$transaction(async (tx) => {
      const authority = await tx.registryAuthority.upsert({
        where: { code: council },
        update: { name: PROFESSIONAL_COUNCILS[council] },
        create: { code: council, name: PROFESSIONAL_COUNCILS[council], country: 'BR' },
      });

      const existingProfessional = await tx.practitioner.findUnique({ where: { userId: user.id } });
      const practitioner = existingProfessional
        ? await tx.practitioner.update({
            where: { id: existingProfessional.id },
            data: {
              name: user.name,
              profession,
              specialty,
              verificationStatus: existingProfessional.verificationStatus === 'suspended' ? 'suspended' : 'pending',
              verifiedAt: null,
              active: existingProfessional.verificationStatus !== 'suspended',
            },
          })
        : await tx.practitioner.create({
            data: {
              userId: user.id,
              name: user.name,
              profession,
              specialty,
              verificationStatus: 'pending',
              active: true,
            },
          });

      const duplicate = await tx.professionalRegistration.findUnique({
        where: {
          authorityId_registration_region: {
            authorityId: authority.id,
            registration,
            region: region || null,
          },
        },
      });

      if (duplicate && duplicate.practitionerId !== practitioner.id) {
        throw new Error('PROFESSIONAL_REGISTRATION_IN_USE');
      }

      if (duplicate) {
        await tx.professionalRegistration.update({
          where: { id: duplicate.id },
          data: { status: duplicate.status === 'active' ? 'active' : 'unknown' },
        });
      } else {
        await tx.professionalRegistration.create({
          data: {
            practitionerId: practitioner.id,
            authorityId: authority.id,
            registration,
            region: region || null,
            status: 'unknown',
          },
        });
      }

      if (existingProfessional) {
        await tx.accessGrant.updateMany({ where: { practitionerId: practitioner.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.accessRequest.updateMany({ where: { practitionerId: practitioner.id, status: { in: ['pending', 'approved'] } }, data: { status: 'revoked' } });
      }
      return tx.practitioner.findUnique({
        where: { id: practitioner.id },
        include: { registrations: { include: { authority: true } } },
      });
    });

    if (!result) return fail(res, 500, 'Não foi possível salvar o perfil profissional.');
    return res.json({
      id: result.id,
      name: result.name,
      profession: result.profession,
      specialty: result.specialty,
      verificationStatus: result.verificationStatus,
      verifiedAt: result.verifiedAt?.toISOString() ?? null,
      active: result.active,
      registrations: result.registrations.map((item) => ({
        id: item.id,
        council: item.authority.code,
        councilName: item.authority.name,
        registration: item.registration,
        region: item.region,
        status: item.status,
        verifiedAt: item.verifiedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'PROFESSIONAL_REGISTRATION_IN_USE') {
      return fail(res, 409, 'Este registro profissional já está associado a outra conta.');
    }
    console.error('V1 professional profile error', error);
    return fail(res, 500, 'Não foi possível salvar o perfil profissional agora.');
  }
});

/** Perfis/prontuários que o usuário autenticado pode abrir após o login. */
router.get('/profiles', auth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  // Não selecionar colunas de recursos novos para listar perfis antigos.
  const profileSelect = { id: true, record: true, name: true, ownerUserId: true, archived: true, data: true } as const;
  try {
  const [owned, grants] = await Promise.all([
    prisma.patient.findMany({ where: { ownerUserId: userId, archived: false }, orderBy: { name: 'asc' }, select: profileSelect }),
    prisma.accessGrant.findMany({
      where: {
        accountId: userId,
        // O consentimento profissional pertence exclusivamente à área Clinicar.
        permission: { not: 'read_write_consultation' },
        validFrom: { lte: new Date() },
        revokedAt: null,
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      include: { patient: { select: profileSelect } },
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
  } catch {
    console.error('MyDoctor: falha ao carregar perfis; processo preservado.');
    return fail(res, 503, 'Não foi possível carregar os perfis. Tente novamente em instantes.');
  }
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

  await purgeExpiredDiary(req.params.patientId);
  const events = await prisma.healthEvent.findMany({
    where: { patientId: req.params.patientId, status: { not: 'draft' } },
    include: { practitioner: true, organization: true, location: true },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
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
      payload: type === 'wellbeing_diary' ? { ...(body.payload ?? {}), entries: retainedDiaryEntries(body.payload) } : body.payload ?? {},
      provenance: {
        source: 'mydoctor_manual',
        actorUserId: req.userId!,
        actorName: actor?.name ?? '',
        createdAt: new Date().toISOString(),
      },
    },
  });

  // Confirma a persistencia antes de informar sucesso ao frontend.
  const persisted = await prisma.healthEvent.findUnique({
    where: { id: event.id },
    include: { practitioner: true, organization: true, location: true },
  });
  if (!persisted) {
    console.error('V1 health event persistence verification failed', { eventId: event.id, patientId: req.params.patientId });
    return fail(res, 500, 'O registro nao pôde ser confirmado no prontuario. Tente novamente.');
  }
  console.info('V1 health event persisted', { eventId: persisted.id, patientId: persisted.patientId, status: persisted.status });
  res.status(201).json(persisted);
});

/** Edita um evento manual preservando snapshot anterior na proveniência. */
router.put('/patients/:patientId/events/:eventId', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  if (!ids.has(req.params.patientId)) return fail(res, 403, 'Você não tem acesso a este prontuário.');
  const current = await prisma.healthEvent.findFirst({ where: { id: req.params.eventId, patientId: req.params.patientId } });
  if (!current) return fail(res, 404, 'Registro não encontrado.');
  if (current.practitionerId && ['draft', 'pending_patient_confirmation', 'rejected_by_patient'].includes(current.status)) return fail(res, 403, 'Este atendimento deve ser alterado pelo profissional em Clinicar.');
  if (current.practitionerId && current.authoredByUserId === req.userId && !['draft', 'pending_patient_confirmation', 'rejected_by_patient'].includes(current.status)) return fail(res, 403, 'Este atendimento está disponível somente para consulta pelo profissional.');
  if (current.status === 'cancelled') return fail(res, 409, 'Reative o registro antes de editá-lo.');
  const body = req.body ?? {};
  const isDiary = current.type === 'wellbeing_diary';
  if (isDiary && body.type !== undefined && body.type !== 'wellbeing_diary') return fail(res, 400, 'O tipo do Diário não pode ser alterado.');
  const previous = {
    title: current.title, type: current.type, occurredAt: current.occurredAt.toISOString(),
    payload: current.payload, practitionerNameSnapshot: current.practitionerNameSnapshot,
    professionSnapshot: current.professionSnapshot, councilSnapshot: current.councilSnapshot,
    registrationSnapshot: current.registrationSnapshot, registrationRegionSnapshot: current.registrationRegionSnapshot,
    organizationNameSnapshot: current.organizationNameSnapshot,
  };
  const updated = await prisma.healthEvent.update({
    where: { id: current.id },
    data: {
      status: 'amended',
      title: body.title !== undefined ? String(body.title).trim() : current.title,
      type: body.type !== undefined ? String(body.type) : current.type,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : current.occurredAt,
      practitionerNameSnapshot: body.practitionerName !== undefined ? String(body.practitionerName).trim() || null : current.practitionerNameSnapshot,
      professionSnapshot: body.profession !== undefined ? String(body.profession).trim() || null : current.professionSnapshot,
      councilSnapshot: body.council !== undefined ? String(body.council).trim() || null : current.councilSnapshot,
      registrationSnapshot: body.registration !== undefined ? String(body.registration).trim() || null : current.registrationSnapshot,
      registrationRegionSnapshot: body.registrationRegion !== undefined ? String(body.registrationRegion).trim() || null : current.registrationRegionSnapshot,
      organizationNameSnapshot: body.organizationName !== undefined ? String(body.organizationName).trim() || null : current.organizationNameSnapshot,
      payload: isDiary ? { ...(body.payload ?? current.payload), entries: retainedDiaryEntries(body.payload ?? current.payload) } : body.payload ?? current.payload,
      provenance: isDiary ? {} : { source: 'mydoctor_manual', action: 'amended', actorUserId: req.userId!, amendedAt: new Date().toISOString(), previous },
    },
  });
  res.json(updated);
});



function consultantConfigured() {
  const base = process.env.CONSULTANT_BASE_URL;
  try { return Boolean(process.env.CONSULTANT_API_KEY && process.env.CONSULTANT_MODEL && base && new URL(base).protocol === 'https:'); }
  catch { return false; }
}

/** Mesmo saldo por conta para web, APK e iOS. Não revela credenciais. */
router.get('/consultant/usage', auth, async (req: AuthedRequest, res: Response) => {
  try {
    const policy = await consultantPolicy(req.userId!);
    res.json({ ...await getConsultantUsage(req.userId!, policy), configured: consultantConfigured() });
  } catch {
    return fail(res, 503, 'O controle de uso do Consultor está indisponível. Contate o suporte.');
  }
});

/** Conversa com IA externa, contexto clínico e limite persistente por conta. */
router.post('/patients/:patientId/consultant', auth, async (req: AuthedRequest, res: Response) => {
  const ids = await visiblePatientIds(req.userId!);
  if (!ids.has(req.params.patientId)) return fail(res, 403, 'Você não tem acesso a este prontuário.');
  const question = String(req.body?.question ?? '').trim();
  if (!question || question.length > 4000) return fail(res, 400, 'Escreva uma pergunta com até 4.000 caracteres.');
  if (req.body?.consent !== true) return fail(res, 400, 'Autorize o envio da pergunta e do contexto à IA.');
  if (!consultantConfigured()) return fail(res, 503, 'O Consultor IA ainda precisa ser configurado pelo administrador. Seu prontuário não foi enviado e nenhum uso foi descontado.');…17572 tokens truncated…-w-0 grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-[180px_1fr_1.2fr_1.4fr_90px] md:items-center"><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Data/Hora</span><time className="break-words text-sm font-semibold text-ink">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></div><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Tipo</span><span className="break-words text-sm text-ink">{EVENT_TYPES.find(([value]) => value === event.type)?.[1] ?? event.type}</span></div><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Especialidade</span><span className="break-words text-sm text-ink">{recordedSpecialty(event) || '—'}</span></div><div className="min-w-0"><span className="block text-[10px] font-bold uppercase text-mute md:hidden">Médico/Atendente</span><span className="break-words text-sm text-ink">{event.practitionerNameSnapshot || '—'}</span></div><span className="col-span-2 text-xs font-bold text-moss-700 group-open:hidden md:col-span-1 md:text-right">Ver detalhes</span><span className="col-span-2 hidden text-xs font-bold text-moss-700 group-open:block md:col-span-1 md:text-right">Fechar</span></div></summary><div className="border-t border-line bg-moss-50/40 px-4 py-4"><div className="grid min-w-0 gap-3 text-sm sm:grid-cols-2"><div><strong className="block text-xs uppercase text-mute">Atendimento(descrição)</strong><p className="mt-1 break-words text-ink">{event.title}</p></div>{event.payload.onlineVisit === true && <div><strong className="block text-xs uppercase text-mute">Local do atendimento</strong><p className="mt-1 text-ink">Atendimento on-line</p></div>}{event.payload.homeVisit === true && <div><strong className="block text-xs uppercase text-mute">Local do atendimento</strong><p className="mt-1 text-ink">Atendimento domiciliar</p></div>}{event.organizationNameSnapshot && <div><strong className="block text-xs uppercase text-mute">Hospital/Clínica/Consultório</strong><p className="mt-1 break-words text-ink">{event.organizationNameSnapshot}</p></div>}<div><strong className="block text-xs uppercase text-mute">Tipo</strong><p className="mt-1 text-ink">{EVENT_TYPES.find(([value]) => value === event.type)?.[1] ?? event.type}</p></div>{event.practitionerNameSnapshot && <div><strong className="block text-xs uppercase text-mute">Médico/Fisioterapeuta/Atendente</strong><p className="mt-1 break-words text-ink">{event.practitionerNameSnapshot}</p></div>}{recordedSpecialty(event) && <div><strong className="block text-xs uppercase text-mute">Especialidade</strong><p className="mt-1 break-words text-ink">{recordedSpecialty(event)}</p></div>}{event.registrationSnapshot && <div><strong className="block text-xs uppercase text-mute">Registro profissional</strong><p className="mt-1 text-ink">{event.councilSnapshot ?? ''} {event.registrationSnapshot}{event.registrationRegionSnapshot ? `/${event.registrationRegionSnapshot}` : ''}</p></div>}{typeof event.payload?.symptoms === 'string' && event.payload.symptoms && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Sintomas / Queixa principal</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.symptoms}</p></div>}{typeof event.payload?.diagnosis === 'string' && event.payload.diagnosis && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Diagnóstico / Causa / Hipótese</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.diagnosis}</p></div>}{typeof event.payload?.exams === 'string' && event.payload.exams && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Exames</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.exams}</p></div>}{typeof event.payload?.prescriptions === 'string' && event.payload.prescriptions && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Receitas / Prescrições</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.prescriptions}</p></div>}{typeof event.payload?.notes === 'string' && event.payload.notes && <div className="sm:col-span-2"><strong className="block text-xs uppercase text-mute">Observações</strong><p className="mt-1 whitespace-pre-wrap break-words text-ink">{event.payload.notes}</p></div>}<div className="sm:col-span-2 flex flex-wrap gap-2 border-t border-line pt-3">{event.status !== 'cancelled' ? <><SecondaryButton onClick={() => startEditEvent(event)}>Editar</SecondaryButton><button type="button" onClick={() => inactivateEvent(event)} className="rounded-xl border border-danger-500 px-4 py-3 text-sm font-bold text-danger-600">Inativar</button></> : <PrimaryButton onClick={() => reactivateEvent(event)}>Reativar</PrimaryButton>}</div></div></div></details>)}</div></div>}</Card>;

  const recordView = <div className="space-y-5">{showRecordForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">{editingEventId ? 'Editar Atendimento' : 'Novo Atendimento'}</h3><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2"><EncounterFields value={{type:eventType,occurredAt:eventDate,organizationName,homeVisit,onlineVisit,title:eventTitle,symptoms,diagnosis,exams:examsText,prescriptions,notes}} onChange={value=>{setEventType(value.type);setEventDate(value.occurredAt);setOrganizationName(value.organizationName);setHomeVisit(value.homeVisit);setOnlineVisit(value.onlineVisit);setEventTitle(value.title);setSymptoms(value.symptoms);setDiagnosis(value.diagnosis);setExamsText(value.exams);setPrescriptions(value.prescriptions);setNotes(value.notes);}}><label className="min-w-0 text-xs font-bold text-mute">CRM/CREFITO<div className="mt-1 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_110px]"><select value={council} onChange={(e) => setCouncil(e.target.value)} className={inputClass()}><option value="CRM">CRM</option><option value="CREFITO">Crefito</option><option value="Outros">Outros</option></select><input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="Número" className={inputClass()} /><select value={registrationRegion} onChange={(e) => setRegistrationRegion(e.target.value)} className={inputClass()}><option value="">UF</option>{BRAZIL_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></div></label><label className="min-w-0 text-xs font-bold text-mute">Nome do Médico/Fisioterapeuta/Atendente<input value={practitionerName} onChange={(e) => setPractitionerName(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Especialidade<input value={profession} onChange={(e) => setProfession(e.target.value)} className={`${inputClass()} mt-1`} /></label></EncounterFields><div className="md:col-span-2 rounded-xl border border-line bg-paper p-4"><p className="text-xs font-bold uppercase tracking-wide text-mute">Anexos do Atendimento</p><p className="mt-1 text-xs text-mute">Você pode anexar vários PDFs ou imagens em cada categoria. Arquivos já salvos permanecem vinculados ao Atendimento.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-sm font-bold text-ink">📄 Laudo / Relatório</p><label className="mt-2 inline-flex cursor-pointer rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">+ Selecionar arquivos<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setReportFiles((current) => [...current, ...Array.from(e.target.files ?? [])])} /></label>{reportFiles.length > 0 && <div className="mt-2 space-y-1">{reportFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><button type="button" title="Remover arquivo selecionado" aria-label="Remover arquivo selecionado" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger-600" onClick={() => setReportFiles((current) => current.filter((_, i) => i !== index))}><span aria-hidden="true">🗑️</span></button></div>)}</div>}{savedDocuments.filter((doc) => doc.type === 'report').map((doc) => <div key={doc.id} className="mt-2 rounded-lg bg-paper px-2 py-2 text-xs"><div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-ink" title={doc.originalFilename}>{doc.originalFilename}</span><span className="shrink-0 text-moss-700">Salvo</span></div><div className="mt-2 flex items-center justify-between gap-2"><button type="button" className="text-xs font-bold text-moss-800 underline" onClick={() => activeProfile && editingEventId && void api.openHealthEventDocument(activeProfile.id, editingEventId, doc.id, doc.originalFilename)}>Visualizar</button><button type="button" title="Remover anexo" aria-label="Remover anexo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50" onClick={() => activeProfile && editingEventId && void run(async () => { if (!window.confirm('Remover este anexo do Atendimento?')) return; await api.inactivateHealthEventDocument(activeProfile.id, editingEventId, doc.id); setSavedDocuments((items) => items.filter((item) => item.id !== doc.id)); })}><span aria-hidden="true">🗑️</span></button></div></div>)}</div><div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-sm font-bold text-ink">💊 Receita / Prescrição</p><label className="mt-2 inline-flex cursor-pointer rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">+ Selecionar arquivos<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setPrescriptionFiles((current) => [...current, ...Array.from(e.target.files ?? [])])} /></label>{prescriptionFiles.length > 0 && <div className="mt-2 space-y-1">{prescriptionFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><button type="button" title="Remover arquivo selecionado" aria-label="Remover arquivo selecionado" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger-600" onClick={() => setPrescriptionFiles((current) => current.filter((_, i) => i !== index))}><span aria-hidden="true">🗑️</span></button></div>)}</div>}{savedDocuments.filter((doc) => doc.type === 'prescription').map((doc) => <div key={doc.id} className="mt-2 rounded-lg bg-paper px-2 py-2 text-xs"><div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-ink" title={doc.originalFilename}>{doc.originalFilename}</span><span className="shrink-0 text-moss-700">Salvo</span></div><div className="mt-2 flex items-center justify-between gap-2"><button type="button" className="text-xs font-bold text-moss-800 underline" onClick={() => activeProfile && editingEventId && void api.openHealthEventDocument(activeProfile.id, editingEventId, doc.id, doc.originalFilename)}>Visualizar</button><button type="button" title="Remover anexo" aria-label="Remover anexo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50" onClick={() => activeProfile && editingEventId && void run(async () => { if (!window.confirm('Remover este anexo do Atendimento?')) return; await api.inactivateHealthEventDocument(activeProfile.id, editingEventId, doc.id); setSavedDocuments((items) => items.filter((item) => item.id !== doc.id)); })}><span aria-hidden="true">🗑️</span></button></div></div>)}</div><div className="rounded-2xl border border-line bg-white p-4 shadow-sm"><p className="text-sm font-bold text-ink">🧪 Exames</p><label className="mt-2 inline-flex cursor-pointer rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800">+ Selecionar arquivos<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setExamFiles((current) => [...current, ...Array.from(e.target.files ?? [])])} /></label>{examFiles.length > 0 && <div className="mt-2 space-y-1">{examFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><button type="button" title="Remover arquivo selecionado" aria-label="Remover arquivo selecionado" className="inline-flex h-7 w-7 items-center justify-center rounded-md text-danger-600" onClick={() => setExamFiles((current) => current.filter((_, i) => i !== index))}><span aria-hidden="true">🗑️</span></button></div>)}</div>}{savedDocuments.filter((doc) => doc.type === 'exam').map((doc) => <div key={doc.id} className="mt-2 rounded-lg bg-paper px-2 py-2 text-xs"><div className="flex min-w-0 items-center justify-between gap-2"><span className="min-w-0 flex-1 truncate font-semibold text-ink" title={doc.originalFilename}>{doc.originalFilename}</span><span className="shrink-0 text-moss-700">Salvo</span></div><div className="mt-2 flex items-center justify-between gap-2"><button type="button" className="text-xs font-bold text-moss-800 underline" onClick={() => activeProfile && editingEventId && void api.openHealthEventDocument(activeProfile.id, editingEventId, doc.id, doc.originalFilename)}>Visualizar</button><button type="button" title="Remover anexo" aria-label="Remover anexo" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-danger-200 text-danger-600 hover:bg-danger-50" onClick={() => activeProfile && editingEventId && void run(async () => { if (!window.confirm('Remover este anexo do Atendimento?')) return; await api.inactivateHealthEventDocument(activeProfile.id, editingEventId, doc.id); setSavedDocuments((items) => items.filter((item) => item.id !== doc.id)); })}><span aria-hidden="true">🗑️</span></button></div></div>)}</div></div></div><div className="md:col-span-2 flex flex-wrap gap-2"><PrimaryButton disabled={busy} onClick={() => void createEvent()}>{busy ? 'Salvando...' : editingEventId ? 'Salvar alterações' : 'Salvar Atendimento'}</PrimaryButton>{editingEventId && <SecondaryButton onClick={() => { resetRecordForm(); setShowRecordForm(false); }}>Cancelar</SecondaryButton>}</div></div></Card>}{!editingEventId && recordList}</div>;

  const familyHistoryEvent = events.find((event) => event.type === 'family_history');
  const saveFamilyHistory = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    const text = familyHistoryText.trim();
    if (!text) throw new Error('Informe o histórico familiar.');
    const input = { type: 'family_history', title: 'Histórico familiar', occurredAt: familyHistoryEvent?.occurredAt ?? new Date().toISOString(), payload: { text } };
    if (familyHistoryEvent) await api.updateHealthEvent(activeProfile.id, familyHistoryEvent.id, input);
    else await api.createHealthEvent(activeProfile.id, input);
    await loadEvents(activeProfile, api);
    setMessage('Histórico familiar salvo.');
  });
  const familyHistoryView = <div className="space-y-5"><Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Histórico familiar</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2><p className="mt-2 text-sm text-mute">Registre informações relevantes sobre a saúde da família. Você pode digitar ou ditar o texto e editar o histórico sempre que precisar.</p>{activeProfile && (familyHistoryEvent && !editingFamilyHistory ? <><p className="mt-4 whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 text-sm text-ink">{String(familyHistoryEvent.payload?.text ?? '')}</p><div className="mt-3"><SecondaryButton disabled={busy} onClick={() => { setFamilyHistoryText(String(familyHistoryEvent.payload?.text ?? '')); setEditingFamilyHistory(true); }}>Editar histórico familiar</SecondaryButton></div></> : <><div className="mt-4"><p className="mb-1 text-xs font-bold text-mute">Histórico familiar</p><DictationTextarea key={activeProfile.id} value={familyHistoryText} onChange={setFamilyHistoryText} className={`${inputClass()} min-h-52`} placeholder="Conte os antecedentes importantes da sua família..." /></div><div className="mt-3 flex flex-wrap gap-2"><PrimaryButton disabled={busy} onClick={() => void saveFamilyHistory()}>{busy ? 'Salvando...' : familyHistoryEvent ? 'Salvar alterações' : 'Salvar histórico familiar'}</PrimaryButton>{familyHistoryEvent && <SecondaryButton disabled={busy} onClick={() => { setFamilyHistoryText(String(familyHistoryEvent.payload?.text ?? '')); setEditingFamilyHistory(false); }}>Cancelar</SecondaryButton>}</div></>)}</Card></div>;

  const diaryEvents = events.filter((event) => event.type === 'wellbeing_diary' && event.status !== 'cancelled');
  const todayKey = localDateTimeInputValue().slice(0, 10);
  const todayDiary = diaryEvents.find((event) => String(event.payload?.diaryDate ?? event.occurredAt.slice(0, 10)) === todayKey);
  const diaryEntries = (event: HealthEventV1) => Array.isArray(event.payload?.entries) ? event.payload.entries as Array<{ at: string; text: string }> : [];

  const deleteDiaryEntry = (day: HealthEventV1, index: number) => run(async () => {
    if (!activeProfile) return;
    if (!window.confirm('Apagar este relato definitivamente? Esta ação não pode ser desfeita.')) return;
    const entry = diaryEntries(day)[index];
    await api.deleteDiaryEntry(activeProfile.id, day.id, index, entry.at, entry.text);
    await loadEvents(activeProfile, api);
    setMessage('Relato apagado.');
  });

  const addDiaryEntry = () => run(async () => {
    if (!activeProfile) throw new Error('Escolha um perfil.');
    const text = diaryText.trim();
    if (!text) throw new Error('Escreva ou dite seu relato.');
    const now = new Date();
    const entry = { at: now.toISOString(), text };
    if (todayDiary) {
      const entries = [...diaryEntries(todayDiary), entry];
      await api.updateHealthEvent(activeProfile.id, todayDiary.id, {
        type: 'wellbeing_diary', title: `Diário de Saúde e Bem-Estar — ${todayKey}`, occurredAt: todayDiary.occurredAt,
        payload: { ...todayDiary.payload, diaryDate: todayKey, entries },
      });
    } else {
      await api.createHealthEvent(activeProfile.id, {
        type: 'wellbeing_diary', title: `Diário de Saúde e Bem-Estar — ${todayKey}`, occurredAt: now.toISOString(),
        payload: { diaryDate: todayKey, entries: [entry] },
      });
    }
    setDiaryText(''); setShowDiaryForm(false); await loadEvents(activeProfile, api);
    setMessage('Relato incluído no Diário de hoje.');
  });

  const diaryView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Meu Diário de Saúde e Bem-Estar</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2><p className="mt-1 text-sm text-mute">Registre como você está se sentindo. Os relatos ficam guardados por 60 dias e depois são apagados automaticamente. Você também pode apagar cada relato antes desse prazo.</p></div>{activeProfile && <PrimaryButton onClick={() => { setDiaryText(''); setShowDiaryForm(true); }}>+ Incluir relato</PrimaryButton>}</div></Card>{showDiaryForm && activeProfile && <Card><div className="flex items-center justify-between gap-3"><div><h3 className="font-display text-xl font-bold text-ink">Novo relato</h3><p className="text-sm text-mute">{new Date().toLocaleString('pt-BR')}</p></div><SecondaryButton onClick={() => { setDiaryText(''); setShowDiaryForm(false); }}>Cancelar</SecondaryButton></div><label className="mt-4 block text-xs font-bold text-mute">O que está acontecendo?<textarea value={diaryText} onChange={(e) => setDiaryText(e.target.value)} className={`${inputClass()} mt-1 min-h-40`} placeholder="Conte livremente como você está se sentindo, o que comeu, medicamentos, exercícios, reações, melhora ou piora..." /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-xl border border-danger-200 px-4 py-3 text-sm font-bold text-danger-600" onClick={() => { if (!diaryText || window.confirm('Apagar todo o texto deste relato e começar novamente?')) setDiaryText(''); }}>🗑️ Limpar texto</button><PrimaryButton disabled={busy} onClick={() => void addDiaryEntry()}>{busy ? 'Salvando...' : 'Salvar relato'}</PrimaryButton></div></Card>}<div className="space-y-3">{diaryEvents.length === 0 ? <Card><p className="text-sm text-mute">Nenhum relato no Diário ainda.</p></Card> : diaryEvents.map((day) => <Card key={day.id}><h3 className="font-display text-xl font-bold text-ink">{new Date(day.occurredAt).toLocaleDateString('pt-BR')}</h3><div className="mt-3 space-y-3">{diaryEntries(day).map((entry, index) => <div key={`${entry.at}-${index}`} className="rounded-xl border border-line bg-white p-3"><time className="text-xs font-bold text-moss-700">{new Date(entry.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{entry.text}</p><button type="button" disabled={busy} className="mt-2 rounded-lg border border-danger-200 px-3 py-2 text-xs font-bold text-danger-600 disabled:opacity-50" onClick={() => void deleteDiaryEntry(day, index)}>Apagar relato</button></div>)}</div></Card>)}</div></div>;

  const vitalsView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Sinais vitais</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2></div>{activeProfile && <PrimaryButton onClick={() => setShowVitalForm((v) => !v)}>{showVitalForm ? 'Cancelar' : '+ Incluir medição'}</PrimaryButton>}</div>{!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil.</p> : vitalEvents.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhuma medição registrada. Use “+ Incluir medição” para cadastrar.</div> : <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">{vitalEvents.map((event) => { const payload = vitalPayload(event); return <article key={event.id} className="min-w-0 rounded-xl border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-moss-700">{String(payload.label ?? 'Sinal vital')}</p><h3 className="mt-1 break-words text-xl font-bold text-ink">{String(payload.value ?? '')}{payload.secondaryValue ? `/${String(payload.secondaryValue)}` : ''} <span className="text-sm font-semibold text-mute">{String(payload.unit ?? '')}</span></h3><p className="mt-1 text-xs text-mute">Origem: {String(payload.source ?? 'manual')}</p><time className="mt-2 block text-xs text-mute">{new Date(event.occurredAt).toLocaleString('pt-BR')}</time></article>; })}</div>}</Card>{showVitalForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">Nova medição</h3><p className="mt-1 text-sm text-mute">A captura automática por Apple Health/Health Connect será habilitada no aplicativo nativo. Aqui o registro é manual.</p><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><select value={vitalType} onChange={(e) => setVitalType(e.target.value as VitalType)} className={inputClass()}>{VITAL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="datetime-local" value={vitalDate} onChange={(e) => setVitalDate(e.target.value)} className={inputClass()} /><input value={vitalValue} onChange={(e) => setVitalValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder={vitalType === 'blood_pressure' ? 'Sistólica' : `Valor em ${selectedVital[2]}`} className={inputClass()} />{vitalType === 'blood_pressure' && <input value={vitalSecondaryValue} onChange={(e) => setVitalSecondaryValue(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="Diastólica" className={inputClass()} />}<select value={vitalSource} onChange={(e) => setVitalSource(e.target.value)} className={inputClass()}><option value="manual">Digitado manualmente</option><option value="healthkit">Apple Health / HealthKit</option><option value="health_connect">Android Health Connect</option><option value="bluetooth">Dispositivo Bluetooth</option><option value="institution">Instituição de saúde</option></select><input value={vitalDevice} onChange={(e) => setVitalDevice(e.target.value)} placeholder="Aparelho/dispositivo (opcional)" className={inputClass()} /><div className="sm:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createVital()}>Salvar sinal vital</PrimaryButton></div></div></Card>}</div>;

  const insuranceView = <div className="space-y-5"><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Convênios</p><h2 className="font-display text-2xl font-bold text-ink">{activeProfile?.name ?? 'Escolha um perfil'}</h2></div>{activeProfile && <PrimaryButton onClick={() => setShowInsuranceForm((v) => !v)}>{showInsuranceForm ? 'Cancelar' : '+ Incluir convênio'}</PrimaryButton>}</div>{!activeProfile ? <p className="mt-4 text-sm text-mute">Escolha um perfil.</p> : insuranceEvents.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-white p-5 text-sm text-mute">Nenhum convênio cadastrado. Use “+ Incluir convênio” para adicionar.</div> : <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">{insuranceEvents.map((event) => { const payload = event.payload as InsurancePayload; return <article key={event.id} className="min-w-0 overflow-hidden rounded-xl border border-line bg-white p-4"><h3 className="break-words font-display text-lg font-bold text-ink">{payload.provider || event.title}</h3>{payload.planName && <p className="break-words text-sm text-mute">{payload.planName}</p>}<div className="mt-3 space-y-1 break-words text-sm text-ink">{payload.memberNumber && <p><strong>Carteirinha:</strong> {payload.memberNumber}</p>}{payload.holderName && <p><strong>Titular:</strong> {payload.holderName}</p>}{payload.validity && <p><strong>Validade:</strong> {new Date(`${payload.validity}T12:00:00`).toLocaleDateString('pt-BR')}</p>}</div>{(payload.cardFront || payload.cardBack) && <div className="mt-4 grid min-w-0 grid-cols-2 gap-2">{payload.cardFront && <figure className="min-w-0"><img src={payload.cardFront} alt="Frente da carteirinha" className="h-28 w-full rounded-lg border border-line object-cover" /><figcaption className="mt-1 text-center text-[10px] text-mute">Frente</figcaption></figure>}{payload.cardBack && <figure className="min-w-0"><img src={payload.cardBack} alt="Verso da carteirinha" className="h-28 w-full rounded-lg border border-line object-cover" /><figcaption className="mt-1 text-center text-[10px] text-mute">Verso</figcaption></figure>}</div>}</article>; })}</div>}</Card>{showInsuranceForm && activeProfile && <Card><h3 className="font-display text-xl font-bold text-ink">Novo convênio</h3><div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"><label className="min-w-0 text-xs font-bold text-mute">Convênio / operadora<input value={insuranceProvider} onChange={(e) => setInsuranceProvider(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Plano / categoria<input value={insurancePlan} onChange={(e) => setInsurancePlan(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Número da carteirinha<input value={insuranceNumber} onChange={(e) => setInsuranceNumber(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 text-xs font-bold text-mute">Nome do titular<input value={insuranceHolder} onChange={(e) => setInsuranceHolder(e.target.value)} className={`${inputClass()} mt-1`} /></label><label className="min-w-0 overflow-hidden text-xs font-bold text-mute sm:col-span-2">Validade da carteirinha<input type="date" value={insuranceValidity} onChange={(e) => setInsuranceValidity(e.target.value)} className={`${inputClass()} mt-1`} /></label><div className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2"><label className="min-w-0 rounded-xl border border-line bg-white p-3 text-xs font-bold text-mute">Foto da carteirinha — frente<input type="file" accept="image/*" capture="environment" onChange={(e) => handleCardPhoto('front', e.target.files?.[0])} className="mt-2 block w-full min-w-0 max-w-full text-xs" />{insuranceFront && <img src={insuranceFront} alt="Prévia da frente" className="mt-3 h-32 w-full rounded-lg object-cover" />}</label><label className="min-w-0 rounded-xl border border-line bg-white p-3 text-xs font-bold text-mute">Foto da carteirinha — verso<input type="file" accept="image/*" capture="environment" onChange={(e) => handleCardPhoto('back', e.target.files?.[0])} className="mt-2 block w-full min-w-0 max-w-full text-xs" />{insuranceBack && <img src={insuranceBack} alt="Prévia do verso" className="mt-3 h-32 w-full rounded-lg object-cover" />}</label></div><label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Observações<textarea value={insuranceNotes} onChange={(e) => setInsuranceNotes(e.target.value)} className={`${inputClass()} mt-1 min-h-20`} /></label><div className="sm:col-span-2"><PrimaryButton disabled={busy} onClick={() => void createInsurance()}>Salvar convênio</PrimaryButton></div></div></Card>}</div>;


  const askConsultant = () => run(async () => {
    if (busy) return;
    if (!activeProfile) throw new Error('Escolha um perfil.');
    const question = consultantQuestion.trim();
    if (!question) throw new Error('Digite ou dite sua pergunta.');
    if (!consultantConsent) throw new Error('Autorize o envio do contexto à IA para continuar.');
    const profileId = activeProfile.id;
    try {
      const result = await api.askConsultant(profileId, question, consultantMessages, consultantConsent);
      setConsultantUsage(result.usage);
      if (activeProfileIdRef.current !== profileId) return;
      setConsultantMessages(current => [...current, { role: 'user', content: question }, { role: 'assistant', content: result.answer }]);
      setConsultantQuestion('');
    } finally {
      await api.getConsultantUsage().then(setConsultantUsage).catch(() => undefined);
    }
  });
  const consultantChat = <Card>
    <h3 className="font-display text-xl font-bold text-ink">Converse com o Consultor MyDoctor</h3>
    <p className="mt-2 text-sm text-mute">Dúvidas exclusivamente sobre saúde e bem-estar: doenças, dores, sintomas, medicamentos, exercícios e alimentação. A IA considera os registros disponíveis do prontuário, agenda de medicamentos, diário e histórico familiar. Pode cometer erros, não faz pesquisa na web e não substitui atendimento médico.</p>
    <div className="mt-3 rounded-xl border border-line bg-paper p-3 text-sm" aria-live="polite">
      {consultantUsage ? <>
        <p className="font-bold text-ink">{consultantUsage.remaining} de {consultantUsage.limit} perguntas disponíveis</p>
        <p className="mt-1 text-mute">Limite por conta: {consultantUsage.limit} perguntas respondidas nas últimas {consultantUsage.windowHours} horas, compartilhado entre o site e o aplicativo. Cada mensagem sua que recebe uma resposta conta um uso, inclusive respostas às perguntas do consultor. Falhas e perguntas recusadas por estarem fora de saúde e bem-estar não descontam o saldo.</p>
        {consultantUsage.nextAvailableAt && <p className="mt-1 text-mute">Próxima liberação: {new Date(consultantUsage.nextAvailableAt).toLocaleString('pt-BR')}. Cada uso é liberado {consultantUsage.windowHours} horas após a resposta; não depende da meia-noite.</p>}
        {consultantUsage.pending > 0 && <p className="mt-1 text-mute">{consultantUsage.pending} resposta(s) em processamento, com saldo reservado temporariamente.</p>}
        {!consultantUsage.configured && <p className="mt-2 font-semibold text-danger-600">O consultor ainda não foi ativado pelo administrador. Nenhum uso será descontado.</p>}
        {consultantUsage.configured && consultantUsage.remaining === 0 && <p className="mt-2 font-semibold text-mute">Seu limite foi atingido. Aguarde a próxima liberação para enviar outra pergunta.</p>}
      </> : <p className="text-mute">{consultantUsageError || 'Verificando disponibilidade e saldo...'}</p>}
    </div>
    {activeProfile && <>
      <div className="mt-4 space-y-3">{consultantMessages.map((item, index) => <div key={index} className="rounded-xl border border-line bg-paper p-3"><p className="text-xs font-bold text-moss-700">{item.role === 'user' ? 'Sua pergunta' : 'Consultor MyDoctor'}</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink">{item.content}</p></div>)}</div>
      <div className="mt-4"><DictationTextarea key={activeProfile.id} value={consultantQuestion} onChange={setConsultantQuestion} placeholder="Digite ou dite sua pergunta..." className={`${inputClass()} min-h-24`} /></div>
      <label className="mt-3 flex gap-2 text-xs text-mute"><input type="checkbox" checked={consultantConsent} onChange={e => setConsultantConsent(e.target.checked)} />Autorizo enviar minha pergunta e os registros clínicos disponíveis ao provedor de IA usado pelo MyDoctor para esta conversa.</label>
      <div className="mt-3"><PrimaryButton disabled={busy || !consultantConsent || !consultantQuestion.trim() || !consultantUsage?.configured || consultantUsage.remaining === 0} onClick={() => void askConsultant()}>{busy ? 'Consultando...' : 'Enviar pergunta'}</PrimaryButton></div>
    </>}
  </Card>;

  const consultantSummary = (() => { const latest = new Map<string, HealthEventV1>(); vitalEvents.forEach((event) => { const type = String(event.payload?.vitalType ?? 'vital'); if (!latest.has(type)) latest.set(type, event); }); return { latestVitals: [...latest.values()], recentClinical: clinicalEvents.slice(0, 5), insurance: insuranceEvents[0] }; })();
  const consultantView = <div className="space-y-5">{consultantChat}<Card><p className="text-xs font-bold uppercase tracking-wide text-moss-700">Consultor MyDoctor</p><h2 className="mt-1 font-display text-2xl font-bold text-ink">Prepare sua próxima consulta</h2><p className="mt-2 text-sm leading-6 text-mute">Organiza o que já existe no prontuário para facilitar a conversa com o profissional de saúde. Não faz diagnóstico.</p></Card><Card><h3 className="font-display text-xl font-bold text-ink">Resumo de {activeProfile?.name ?? 'perfil'}</h3>{!activeProfile ? <p className="mt-3 text-sm text-mute">Escolha um perfil.</p> : <div className="mt-4 space-y-4"><div><p className="text-xs font-bold uppercase text-mute">Últimos sinais vitais</p>{consultantSummary.latestVitals.length === 0 ? <p className="text-sm text-mute">Nenhum sinal vital registrado.</p> : consultantSummary.latestVitals.map((event) => <p key={event.id} className="text-sm text-ink">• {event.title}</p>)}</div><div><p className="text-xs font-bold uppercase text-mute">Convênio</p><p className="text-sm text-ink">{consultantSummary.insurance?.title ?? 'Nenhum convênio cadastrado.'}</p></div><div><p className="text-xs font-bold uppercase text-mute">Histórico familiar</p><p className="whitespace-pre-wrap text-sm text-ink">{familyHistoryEvent?.payload?.text ? 'Histórico familiar disponível para consulta pelo consultor.' : 'Nenhum histórico familiar registrado.'}</p></div><div><p className="text-xs font-bold uppercase text-mute">Eventos recentes</p>{consultantSummary.recentClinical.length === 0 ? <p className="text-sm text-mute">Nenhum evento clínico registrado.</p> : consultantSummary.recentClinical.map((event) => <p key={event.id} className="text-sm text-ink">• {event.title}</p>)}</div></div>}</Card></div>;

  const activeView = view === 'account' ? <AccountProfilePanel api={api} onProfessional={() => {go('welcome');onNavigate?.('professional')}} onSaved={async account => { setUser(account); await loadProfiles(api); }} onContinue={() => go('welcome')} /> : view === 'medications' ? (activeProfile ? <MedicationAgenda key={activeProfile.id} api={api} profile={activeProfile} /> : <Card>Escolha um perfil.</Card>) : view === 'welcome' ? welcomeView : view === 'profiles' ? profilesView : view === 'vitals' ? vitalsView : view === 'diary' ? diaryView : view === 'family-history' ? familyHistoryView : view === 'insurance' ? insuranceView : view === 'consultant' ? consultantView : recordView;

  return <div className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] md:p-8"><header className="mb-4 flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-moss-700">MyDoctor</p><p className="mt-1 text-sm text-mute">Sua saúde e seus cuidados em um só lugar.</p></div>{user && <button type="button" onClick={() => setMenuOpen((value) => !value)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-sm" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}><MenuIcon open={menuOpen} /></button>}</header>{menu}{message && <div className="mb-4 break-words rounded-xl border border-moss-200 bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-800">{message}</div>}{!user ? <div className="mx-auto max-w-md pt-4 sm:pt-10">{authPanel()}</div> : activeView}</div></div>;
}
