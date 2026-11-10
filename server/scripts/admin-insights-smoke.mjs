import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import jwt from 'jsonwebtoken';

if (process.env.NODE_ENV !== 'test') throw Error('Use apenas um banco de teste isolado.');
process.env.PORT = '8810';
await import('../dist/index.js');
const { prisma: db } = await import('../dist/db.js');
const base = 'http://127.0.0.1:8810/api/v1';
const ids = [], tag = randomUUID().slice(0, 8);
async function makeAccount(name, verified = true) {
  const user = await db.user.create({ data: {
    name: name + ' ' + tag, email: name.toLowerCase() + '.' + tag + '@insights.test',
    emailVerifiedAt: verified ? new Date() : null, passwordHash: 'fixture',
  } });
  ids.push(user.id);
  return { ...user, token: jwt.sign({ uid: user.id }, process.env.JWT_SECRET) };
}
async function call(path, account) {
  const response = await fetch(base + path, { headers: account ? { Authorization: 'Bearer ' + account.token } : {} });
  return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() };
}
async function read(path, account) {
  const result = await call(path, account);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.cache, 'private, no-store');
  return result.data;
}
let ok = false;
try {
  for (let i = 0; i < 40; i++) { try { await fetch(base + '/admin/session'); break; } catch { await delay(100); } }
  const admin = await makeAccount('Administrador'), owner = await makeAccount('Alfa'), receiver = await makeAccount('Zulu');
  const unverified = await makeAccount('NaoConfirmado', false);
  process.env.MYDOCTOR_ADMIN_EMAILS = admin.email + ',' + unverified.email;
  const relation = '/admin/accounts/' + owner.userNumber + '/relationships';
  for (const path of ['/admin/storage/plans', '/admin/accounts', '/admin/overview', relation + '?kind=dependents']) {
    assert.equal((await call(path)).status, 401);
    assert.equal((await call(path, owner)).status, 403);
    assert.equal((await call(path, unverified)).status, 403);
  }
  const catalog = await read('/admin/storage/plans', admin);
  assert.deepEqual(catalog.plans.map(x => [x.gb, x.priceCents, x.period]), [[1,0,'unlimited'],[5,200,'month'],[10,350,'month'],[20,650,'month']]);
  assert.equal(catalog.checkoutEnabled, false);
  const before = await read('/admin/overview', admin);
  await db.storageAccount.create({ data: { userId: owner.id, usedBytes: 1234, cart: { create: { gb: 20 } } } });
  await db.storageAccount.create({ data: { userId: receiver.id, limitBytes: 5_000_000_000n } });
  const child = await db.patient.create({ data: {
    id: randomUUID(), name: 'Dependente fictício', ownerUserId: receiver.id, tutorUserId: owner.id, tutorManaged: true,
    data: { hiddenFixture: 'nunca retornar conteúdo do prontuário' },
  } });
  const archived = await db.patient.create({ data: {
    id: randomUUID(), name: 'Arquivado fictício', ownerUserId: receiver.id, tutorUserId: owner.id, tutorManaged: true, archived: true, data: {},
  } });
  const now = Date.now();
  await db.accessGrant.createMany({ data: [
    { accountId: receiver.id, patientId: child.id, grantedByUserId: owner.id, validFrom: new Date(now - 20000) },
    { accountId: receiver.id, patientId: child.id, grantedByUserId: owner.id, validFrom: new Date(now - 20000), validUntil: new Date(now - 10000) },
    { accountId: receiver.id, patientId: child.id, grantedByUserId: owner.id, validFrom: new Date(now - 20000), revokedAt: new Date(now - 10000) },
    { accountId: receiver.id, patientId: child.id, grantedByUserId: owner.id, validFrom: new Date(now + 600000) },
    { accountId: receiver.id, patientId: archived.id, grantedByUserId: owner.id, validFrom: new Date(now - 20000) },
  ] });
  const after = await read('/admin/overview', admin);
  assert.equal(after.totals.accounts, before.totals.accounts);
  for (const metric of ['profiles','dependents','tutors','accesses']) assert.equal(after.totals[metric], before.totals[metric] + 1, metric);
  assert.equal(after.personalBytes, before.personalBytes + 1234);
  const ownerList = await read('/admin/accounts?q='+tag+'&plan=1&cart=20&dependents=yes&granted=yes&received=no', admin);
  assert.deepEqual(ownerList.items, [{ userNumber: owner.userNumber, name: owner.name, email: owner.email,
    limitBytes: 1_000_000_000, cartGb: 20, profiles: 0, dependents: 1, received: 0, granted: 1 }]);
  const receiverList = await read('/admin/accounts?q='+tag+'&plan=5&dependents=no&received=yes', admin);
  assert.deepEqual(receiverList.items.map(x => [x.userNumber, x.received, x.profiles]), [[receiver.userNumber, 1, 1]]);
  assert((await read('/admin/accounts?q='+child.recordNumber, admin)).items.some(x => x.userNumber === owner.userNumber));
  const dependents = await read(relation+'?kind=dependents', admin);
  assert.deepEqual(dependents.items, [{ name: child.name, recordNumber: child.recordNumber,
    owner: { name: receiver.name, userNumber: receiver.userNumber }, tutor: { name: owner.name, userNumber: owner.userNumber } }]);
  const grants = await read(relation+'?kind=granted', admin);
  assert.deepEqual(grants.items.map(x => x.status).sort(), ['active','archived','expired','revoked','scheduled']);
  assert(grants.items.every(x => Object.keys(x.patient).length === 2 && x.account.userNumber === receiver.userNumber));

  for (let i = 0; i < 8; i++) await makeAccount('Pagina' + i);
  const last = await read('/admin/accounts?q='+tag+'&sort=name-desc&page=2', admin);
  assert.equal(last.total, 12);
  assert.equal(last.page, 2);
  assert.equal(last.items.length, 2);
  assert.equal(last.items.at(-1).userNumber, admin.userNumber);
  ok = true;
  console.log('Admin insights: permissions, catalog, live links, history, private data boundaries, filters and pagination OK.');
} finally {
  await db.patient.deleteMany({ where: { ownerUserId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
  process.exitCode = ok ? 0 : 1;
  if (ok) process.exit(0);
  else setTimeout(() => process.exit(1), 1000).unref();
}
