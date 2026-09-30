import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

process.env.PORT = '8788';
process.env.CONSULTANT_API_KEY = 'test-only-no-real-provider';
process.env.CONSULTANT_MODEL = 'mock';
process.env.CONSULTANT_BASE_URL = 'https://mydoctor-provider.test/v1';
process.env.CONSULTANT_RESPONSE_LIMIT = '2';
process.env.CONSULTANT_WINDOW_HOURS = '24';
const realFetch = globalThis.fetch;
let providerFailure = false;
let providerCalls = [];
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith(process.env.CONSULTANT_BASE_URL)) {
    const body = JSON.parse(options.body);
    providerCalls.push(body);
    await delay(50);
    if (providerFailure) return new Response('{}', { status: 429 });
    return Response.json({ choices: [{ message: { content: 'Entendi. Há quantos dias começou?' } }] });
  }
  return realFetch(url, options);
};
await import('../dist/index.js');
const { prisma: db } = await import('../dist/db.js');
const { usageSummary } = await import('../dist/consultant-usage.js');
const base = 'http://127.0.0.1:8788/api/v1';
async function call(path, body, token) {
  const response = await realFetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
const accounts = [];
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await realFetch('http://127.0.0.1:8788/api/health'); break; } catch { await delay(100); }
  }
  const now = new Date('2026-09-30T12:00:00Z');
  const boundary = new Date(now.getTime() - 24 * 3600000);
  const result = usageSummary([{ status: 'completed', completedAt: boundary, leaseUntil: now }], { limit: 2, windowHours: 24 }, now);
  assert.equal(result.used, 0, 'limite exato de 24h deve renovar');
  assert.equal(usageSummary([{ status: 'completed', completedAt: boundary, leaseUntil: now }], { limit: 2, windowHours: 48 }, now).used, 1);
  async function account() {
    const email = `consultant-${Date.now()}-${accounts.length}@mydoctor.test`;
    const password = 'Teste123!';
    const registered = await call('/auth/register', { name: 'Teste Consultor', email, password });
    assert.equal(registered.status, 201);
    accounts.push(registered.body.id);
    const challenge = await call('/auth/login/start', { email, password, channel: 'email' });
    const login = await call('/auth/login/verify', { challengeId: challenge.body.challengeId, code: challenge.body.developmentCode });
    const profiles = await call('/profiles', null, login.body.token);
    return { token: login.body.token, id: registered.body.id, patientId: profiles.body[0].id };
  }
  const a = await account();
  const path = '/patients/' + a.patientId + '/consultant';
  const input = { question: 'Estou com gripe', consent: true, messages: [{ role: 'user', content: 'Não tive febre' }] };
  assert.equal((await call('/consultant/usage')).status, 401);
  assert.equal((await call(path, { question: 'Gripe' }, a.token)).status, 400);
  assert.equal((await call('/patients/inexistente/consultant', input, a.token)).status, 403);
  const before = await call('/consultant/usage', null, a.token);
  assert.equal(before.body.remaining, 2);
  assert.equal(before.body.configured, true);
  const patient = await db.patient.findUnique({ where: { id: a.patientId } });
  await db.patient.update({ where: { id: a.patientId }, data: { data: { ...patient.data, allergies: ['Teste alergia'], intolerances: [], conditions: ['Teste condição'], faceData: 'DO_NOT_SEND' } } });
  await db.healthEvent.createMany({ data: [
    { patientId: a.patientId, type: 'family_history', title: 'Família', occurredAt: new Date(), payload: { text: 'FAMILY_CONTEXT' } },
    { patientId: a.patientId, type: 'wellbeing_diary', title: 'Diário', occurredAt: new Date(), payload: { entries: [{ at: new Date().toISOString(), text: 'DIARY_CONTEXT' }] } },
  ] });
  providerFailure = true;
  assert.equal((await call(path, input, a.token)).status, 503);
  assert.equal((await call('/consultant/usage', null, a.token)).body.remaining, 2, 'falha descontou saldo');
  providerFailure = false;
  const requests = await Promise.all([call(path, input, a.token), call(path, input, a.token), call(path, input, a.token)]);
  assert.equal(requests.filter(item => item.status === 200).length, 2, 'reservas concorrentes ultrapassaram quota');
  assert.equal(requests.filter(item => item.status === 429).length, 1);
  const after = await call('/consultant/usage', null, a.token);
  assert.equal(after.body.remaining, 0);
  assert.equal(after.body.used, 2);
  assert.equal(after.body.pending, 0);
  assert(after.body.nextAvailableAt);
  const context = JSON.stringify(providerCalls.at(-1));
  assert(context.includes('FAMILY_CONTEXT') && context.includes('DIARY_CONTEXT') && context.includes('Teste alergia') && context.includes('Não tive febre'));
  assert(!context.includes('DO_NOT_SEND'), 'campo não clínico enviado');
  const b = await account();
  assert.equal((await call('/consultant/usage', null, b.token)).body.remaining, 2, 'saldo de outra conta foi afetado');
  const oldest = await db.consultantUsage.findFirst({ where: { userId: a.id }, orderBy: { completedAt: 'asc' } });
  await db.consultantUsage.update({ where: { id: oldest.id }, data: { completedAt: new Date(Date.now() - 24 * 3600000 - 1) } });
  assert.equal((await call('/consultant/usage', null, a.token)).body.remaining, 1, 'saldo não renovou após 24h');
  const plan = await db.plan.create({ data: { code: `consultant-test-${Date.now()}`, name: 'Teste', entitlements: { create: [{ key: 'consultant.responses.max', value: 1 }, { key: 'consultant.window.hours', value: 48 }] } } });
  await db.subscription.create({ data: { userId: b.id, planId: plan.id, status: 'active' } });
  const planned = await call('/consultant/usage', null, b.token);
  assert.equal(planned.body.limit, 1); assert.equal(planned.body.windowHours, 48);
  process.env.CONSULTANT_API_KEY = '';
  assert.equal((await call('/patients/' + b.patientId + '/consultant', input, b.token)).status, 503);
  assert.equal((await call('/consultant/usage', null, b.token)).body.used, 0);
  assert.equal((await call('/consultant/usage', null, b.token)).body.configured, false);
  console.log('✅ Consultor: autorização, contexto, saldo, concorrência, falhas, renovação e planos OK (provedor simulado).');
  await db.subscription.deleteMany({ where: { planId: plan.id } });
  await db.plan.delete({ where: { id: plan.id } });
} finally {
  await db.user.deleteMany({ where: { id: { in: accounts } } });
  await db.$disconnect();
}
process.exit(0);
