import { Router, type Request, type Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from './db.js';
import { requireAdmin } from './professional-admin.js';
import { objectStorageEnabled } from './document-storage.js';
import { CHECKOUT_ENABLED, FREE_STORAGE_BYTES, storagePlanCatalog } from './storage-plans.js';

const router = Router();
const size = 10;
const pageNumber = (value: unknown) => Math.min(100000, Math.max(1, Math.trunc(Number(value) || 1)));
const text = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 160) : '';
const countRule = (filter: unknown) => filter === 'yes' ? 'some' : filter === 'no' ? 'none' : undefined;
const accountIdentity = { userNumber: true, name: true } as const;
const patientIdentity = { recordNumber: true, name: true } as const;
const liveProfiles = { archived: false };
const dependent: Prisma.PatientWhereInput = { ...liveProfiles, tutorManaged: true, tutorUserId: { not: null } };
const activeGrants = (now: Date): Prisma.AccessGrantWhereInput => ({
  revokedAt: null, validFrom: { lte: now }, OR: [{ validUntil: null }, { validUntil: { gt: now } }],
  patient: liveProfiles,
});
const checked = (handler: (req: Request, res: Response) => Promise<unknown>) =>
  [requireAdmin, (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'private, no-store');
    void handler(req, res).catch(error => {
      console.error('MyDoctor: falha na consulta administrativa', error?.code ?? error?.name ?? 'unknown');
      res.status(503).json({ error: 'Não foi possível consultar os dados administrativos agora. Tente novamente.' });
    });
  }] as const;
const quota = (gb: number) => BigInt(gb) * FREE_STORAGE_BYTES;
const numeric = (value: string) => /^[1-9]\d{0,8}$/.test(value) ? Number(value) : undefined;

router.get('/admin/storage/plans', ...checked(async (_req, res) =>
  res.json({ plans: storagePlanCatalog, checkoutEnabled: CHECKOUT_ENABLED })));

router.get('/admin/overview', ...checked(async (_req, res) => {
  const now = new Date();
  const [accounts, profiles, dependents, tutors, accesses, professionals, storage] = await prisma.$transaction([
    prisma.user.count(),
    prisma.patient.count({ where: liveProfiles }),
    prisma.patient.count({ where: dependent }),
    prisma.user.count({ where: { tutoredPatients: { some: dependent } } }),
    prisma.accessGrant.count({ where: activeGrants(now) }),
    prisma.practitioner.count({ where: { active: true, verificationStatus: 'verified' } }),
    prisma.storageAccount.aggregate({ _sum: { usedBytes: true }, _count: true }),
  ], { isolationLevel: 'RepeatableRead' });
  res.json({
    observedAt: now, api: 'responding', database: 'responding',
    storageMode: objectStorageEnabled() ? 's3' : 'default', checkoutEnabled: CHECKOUT_ENABLED,
    totals: { accounts, profiles, dependents, tutors, accesses, professionals, storageAccounts: storage._count },
    personalBytes: Number(storage._sum.usedBytes ?? 0n),
  });
}));

router.get('/admin/accounts', ...checked(async (req, res) => {
  const now = new Date(), active = activeGrants(now);
  const q = text(req.query.q), number = numeric(q);
  const plan = text(req.query.plan), cart = text(req.query.cart), sort = req.query.sort === 'name-desc' ? 'desc' : 'asc';
  const withDependents = countRule(req.query.dependents), withReceived = countRule(req.query.received), withGranted = countRule(req.query.granted);
  const filters: Prisma.UserWhereInput[] = [];
  if (q) filters.push({ OR: [
    { name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } },
    ...(number ? [{ userNumber: number }, { patients: { some: { ...liveProfiles, recordNumber: number } } }, { tutoredPatients: { some: { ...dependent, recordNumber: number } } }] : []),
  ] });
  if (plan === '1') filters.push({ OR: [{ storageAccount: { is: null } }, { storageAccount: { is: { limitBytes: FREE_STORAGE_BYTES } } }] });
  else if (plan === 'other') filters.push({ storageAccount: { is: { limitBytes: { notIn: storagePlanCatalog.map(p => quota(p.gb)) } } } });
  else if (['5', '10', '20'].includes(plan)) filters.push({ storageAccount: { is: { limitBytes: quota(Number(plan)) } } });
  if (['5', '10', '20'].includes(cart)) filters.push({ storageAccount: { is: { cart: { is: { gb: Number(cart) } } } } });
  if (withDependents) filters.push({ tutoredPatients: { [withDependents]: dependent } });
  if (withReceived) filters.push({ grants: { [withReceived]: active } });
  if (withGranted) filters.push({ grantedAccesses: { [withGranted]: active } });
  const where = { AND: filters };
  const result = await prisma.$transaction(async tx => {
    const total = await tx.user.count({ where });
    const page = Math.min(pageNumber(req.query.page), Math.max(1, Math.ceil(total / size)));
    const users = await tx.user.findMany({
      where, orderBy: [{ name: sort }, { userNumber: 'asc' }], skip: (page - 1) * size, take: size,
      select: {
        ...accountIdentity, email: true,
        storageAccount: { select: { limitBytes: true, cart: { select: { gb: true } } } },
        _count: { select: {
          patients: { where: liveProfiles }, tutoredPatients: { where: dependent },
          grants: { where: active }, grantedAccesses: { where: active },
        } },
      },
    });
    return { page, total, size, items: users.map(({ storageAccount, _count, ...user }) => ({
      ...user, limitBytes: Number(storageAccount?.limitBytes ?? FREE_STORAGE_BYTES),
      cartGb: storageAccount?.cart?.gb ?? null,
      profiles: _count.patients, dependents: _count.tutoredPatients,
      received: _count.grants, granted: _count.grantedAccesses,
    })) };
  }, { isolationLevel: 'RepeatableRead' });
  res.json(result);
}));

router.get('/admin/accounts/:userNumber/relationships', ...checked(async (req, res) => {
  const userNumber = numeric(String(req.params.userNumber));
  const kind = text(req.query.kind);
  if (!userNumber || !['profiles', 'dependents', 'received', 'granted'].includes(kind)) {
    return res.status(400).json({ error: 'Selecione uma conta e um tipo de vínculo válido.' });
  }
  const now = new Date();
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { userNumber }, select: { id: true } });
    if (!user) return null;
    const pageFor = (total: number) => Math.min(pageNumber(req.query.page), Math.max(1, Math.ceil(total / size)));
    if (kind === 'profiles' || kind === 'dependents') {
      const where = kind === 'profiles' ? { ...liveProfiles, ownerUserId: user.id } : { ...dependent, tutorUserId: user.id };
      const total = await tx.patient.count({ where }), page = pageFor(total);
      const items = await tx.patient.findMany({
        where, orderBy: [{ name: 'asc' }, { recordNumber: 'asc' }], take: size, skip: (page - 1) * size,
        select: { ...patientIdentity, owner: { select: accountIdentity }, tutor: { select: accountIdentity } },
      });
      return { total, page, size, items };
    }
    const where = kind === 'received' ? { accountId: user.id } : { grantedByUserId: user.id };
    const total = await tx.accessGrant.count({ where }), page = pageFor(total);
    const rows = await tx.accessGrant.findMany({
      where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: size, skip: (page - 1) * size,
      select: {
        id: true, validFrom: true, validUntil: true, revokedAt: true, permission: true,
        patient: { select: { ...patientIdentity, archived: true } },
        account: { select: accountIdentity }, grantedByUser: { select: accountIdentity },
      },
    });
    return { total, page, size, items: rows.map(({ patient: { archived, ...patient }, revokedAt, ...row }) => ({
      ...row, patient, status: revokedAt ? 'revoked' : archived ? 'archived' : row.validFrom > now ? 'scheduled' :
        row.validUntil && row.validUntil <= now ? 'expired' : 'active',
    })) };
  }, { isolationLevel: 'RepeatableRead' });
  if (!result) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json(result);
}));

export default router;
