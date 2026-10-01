import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
process.env.PORT = '8793';
process.env.MYDOCTOR_ADMIN_EMAILS = '';
await import('../dist/index.js');
const { prisma: db } = await import('../dist/db.js');
const base = 'http://127.0.0.1:8793/api/v1';
const accounts = [];
const professionals = [];
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function account(name) {
  const email = 'admin-test-' + Date.now() + '-' + accounts.length + '@mydoctor.test';
  const password = 'Teste123!';
  const registered = await call('/auth/register', null, { name, email, password });
  assert.equal(registered.status, 201); accounts.push(registered.body.id);
  const start = await call('/auth/login/start', null, { email, password, channel: 'email' });
  const login = await call('/auth/login/verify', null, { challengeId: start.body.challengeId, code: start.body.developmentCode });
  assert.equal(login.status, 200);
  const profiles = await call('/profiles', login.body.token);
  return { id: registered.body.id, email, token: login.body.token, patientId: profiles.body[0].id };
}
try {
  for (let i = 0; i < 30; i++) { try { await fetch('http://127.0.0.1:8793/api/health'); break; } catch { await delay(100); } }
  const admin = await account('Administrador teste');
  const professional = await account('Profissional teste');
  const patient = await account('Paciente teste');
  process.env.MYDOCTOR_ADMIN_EMAILS = admin.email;
  assert.equal((await call('/admin/professionals')).status, 401);
  assert.equal((await call('/admin/professionals', patient.token)).status, 403);
  assert.equal((await call('/admin/session', patient.token)).body.authorized, false);
  assert.equal((await call('/admin/session', admin.token)).body.authorized, true);
  const profileData = { profession: 'Médico teste', council: 'CRM', registration: String(Date.now()), region: 'SP', specialty: 'Teste', verificationStatus: 'verified' };
  const requested = await call('/professional/profile', professional.token, profileData, 'PUT');
  assert.equal(requested.body.verificationStatus, 'pending', 'autoverificação indevida');
  professionals.push(requested.body.id);
  assert.equal((await call('/professional/access-requests', professional.token)).status, 403);
  async function reviewRow() { const list = await call('/admin/professionals', admin.token); assert.equal(list.status, 200); return list.body.find(row => row.id === requested.body.id); }
  let row = await reviewRow();
  const path = '/admin/professionals/' + row.id + '/decision';
  const input = { decision: 'approve', note: 'Conferência de teste sem dados reais', evidence: 'Fonte oficial simulada e identidade conferida em teste', checkedIdentityAndCouncil: true, registrationId: row.registrations[0].id, expectedUpdatedAt: row.updatedAt };
  assert.equal((await call(path, professional.token, input)).status, 403);
  assert.equal((await call(path, admin.token, { ...input, checkedIdentityAndCouncil: false })).status, 400);
  assert.equal((await call(path, admin.token, { ...input, expectedUpdatedAt: '2000-01-01T00:00:00Z' })).status, 409);
  const concurrent = await Promise.all([call(path, admin.token, input), call(path, admin.token, input)]);
  assert.equal(concurrent.filter(r => r.status === 200).length, 1);
  assert.equal(concurrent.filter(r => r.status === 409).length, 1);
  assert.equal((await call('/professional/access-requests', professional.token)).status, 200);
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 403, 'aprovação concedeu acesso ao paciente');
  row = await reviewRow(); assert.equal(row.history.length, 1); assert.equal(row.history[0].actorName, 'Administrador teste');
  await db.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "test_legacy_grant_pair_unique" ON "AccessGrant" ("accountId", "patientId")');
  const legacyGrant = await db.accessGrant.create({ data: { accountId: professional.id, patientId: patient.patientId, level: 'leitura', revokedAt: new Date() } });
  const access = await call('/professional/access-requests', professional.token, { patientId: patient.patientId });
  const incoming = await call('/access-requests/incoming', patient.token);
  assert.equal(incoming.body.find(item => item.id === access.body.id).status, 'pending');
  assert.equal((await call('/access-requests/' + access.body.id + '/decision', admin.token, { decision: 'approve', duration: 'indefinite' })).status, 403);
  assert.equal((await call('/access-requests/' + access.body.id + '/decision', patient.token, { decision: 'approve', duration: 'until', validUntil: '2000-01-01T00:00:00Z' })).status, 400);
  const permission = await call('/access-requests/' + access.body.id + '/decision', patient.token, { decision: 'approve', duration: 'indefinite' });
  assert.equal(permission.status, 200);
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 200);
  assert.equal(permission.body.validUntil, null);
  assert.equal(permission.body.grantId, legacyGrant.id, 'Autorização antiga não foi renovada');
  assert.equal(await db.accessGrant.count({ where: { accountId: professional.id, patientId: patient.patientId } }), 1);
  assert.equal((await call('/access-requests/incoming', patient.token)).body.find(item => item.id === access.body.id).status, 'approved');
  assert.equal((await call('/access-requests/' + access.body.id + '/revoke', admin.token, {})).status, 403);
  assert.equal((await call('/access-requests/' + access.body.id + '/revoke', patient.token, {})).status, 200);
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 403);
  assert.equal((await call('/professional/consultations', professional.token, { accessRequestId: access.body.id, title: 'Teste', occurredAt: new Date().toISOString() })).status, 403);
  const timed = await call('/professional/access-requests', professional.token, { patientId: patient.patientId });
  const until = new Date(Date.now() + 3600000).toISOString();
  const decisions = await Promise.all([call('/access-requests/' + timed.body.id + '/decision', patient.token, { decision: 'approve', duration: 'until', validUntil: until }), call('/access-requests/' + timed.body.id + '/decision', patient.token, { decision: 'approve', duration: 'until', validUntil: until })]);
  assert.equal(decisions.filter(result => result.status === 200).length, 1);
  assert.equal(decisions.filter(result => result.status === 409).length, 1);
  const timedGrant = decisions.find(result => result.status === 200).body;
  assert.equal(timedGrant.validUntil, until);
  assert.equal(timedGrant.grantId, legacyGrant.id);
  assert.equal((await db.accessGrant.findUnique({ where: { id: legacyGrant.id } })).revokedAt, null);
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 200);
  await db.accessGrant.update({ where: { id: timedGrant.grantId }, data: { validUntil: new Date(Date.now() - 1000) } });
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 403);
  assert.equal((await call('/professional/consultations', professional.token, { accessRequestId: timed.body.id, title: 'Teste', occurredAt: new Date().toISOString() })).status, 403);
  assert.equal((await call('/access-requests/incoming', patient.token)).body.find(item => item.id === timed.body.id).status, 'expired');
  const renewed = await call('/professional/access-requests', professional.token, { patientId: patient.patientId });
  assert.equal((await call('/access-requests/' + renewed.body.id + '/decision', patient.token, { decision: 'approve', duration: 'indefinite' })).status, 200);
  assert.equal((await call('/access-requests/incoming', patient.token)).body.find(item => item.id === timed.body.id).status, 'revoked');
  assert.equal((await call('/access-requests/' + timed.body.id + '/revoke', patient.token, {})).status, 200);
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 200, 'Revogar solicitação antiga afetou a nova autorização');
  row = await reviewRow();
  assert.equal((await call(path, admin.token, { ...input, decision: 'suspend', expectedUpdatedAt: row.updatedAt })).status, 200);
  assert.equal((await call('/professional/access-requests', professional.token)).status, 403);
  assert.equal((await call('/patients/' + patient.patientId + '/events', professional.token)).status, 403, 'suspensão manteve acesso');
  const selfReactivate = await call('/professional/profile', professional.token, profileData, 'PUT');
  assert.equal(selfReactivate.body.verificationStatus, 'suspended');
  assert.equal(selfReactivate.body.active, false);
  row = await reviewRow();
  assert.equal((await call(path, admin.token, { ...input, expectedUpdatedAt: row.updatedAt })).status, 200);
  const changed = await call('/professional/profile', professional.token, { ...profileData, specialty: 'Alterada' }, 'PUT');
  assert.equal(changed.body.verificationStatus, 'pending', 'edição manteve validação antiga');
  row = await reviewRow();
  assert.equal((await call(path, admin.token, { ...input, decision: 'reject', expectedUpdatedAt: row.updatedAt })).status, 200);
  assert.equal((await call('/professional/profile', professional.token)).body.verificationStatus, 'rejected');
  process.env.MYDOCTOR_ADMIN_EMAILS = admin.email + ',' + professional.email;
  row = await reviewRow();
  assert.equal((await call(path, professional.token, { ...input, expectedUpdatedAt: row.updatedAt })).status, 403, 'administrador aprovou próprio perfil');
  row = await reviewRow(); assert.equal(row.history.length, 4);
  process.env.MYDOCTOR_ADMIN_EMAILS = '';
  assert.equal((await call('/admin/professionals', admin.token)).status, 403, 'remoção de administração não surtiu efeito');
  console.log('✅ Administração: autorização, aprovação manual, rejeição, suspensão/revogação, auditoria, concorrência e bloqueio de autovalidação OK.');
} finally {
  await db.$executeRawUnsafe('DROP INDEX IF EXISTS "test_legacy_grant_pair_unique"');
  await db.practitioner.deleteMany({ where: { id: { in: professionals } } });
  await db.user.deleteMany({ where: { id: { in: accounts } } });
  await db.$disconnect();
}
process.exit(0);


