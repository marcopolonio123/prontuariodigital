const base = process.env.MYDOCTOR_API_URL ?? 'http://127.0.0.1:8787';
const email = `ci-${Date.now()}@mydoctor.test`;
const password = 'Teste123!';

async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${response.status}: ${text}`);
  }
  return body;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

console.log('1/10 health');
const health = await call('/api/health');
assert(health?.ok === true && health?.apiV1 === true, 'API V1 deve estar ativa');

console.log('2/10 native V1 register');
const registered = await call('/api/v1/auth/register', {
  method: 'POST',
  body: JSON.stringify({ name: 'Usuário CI MyDoctor', email, password }),
});
assert(registered?.id && registered?.requiresMfaLogin === true, 'cadastro V1 inválido');

console.log('3/10 MFA start + verify');
const challenge = await call('/api/v1/auth/login/start', {
  method: 'POST',
  body: JSON.stringify({ email, password, channel: 'email' }),
});
assert(challenge?.challengeId, 'challengeId ausente');
assert(/^\d{6}$/.test(challenge?.developmentCode ?? ''), 'código MFA de desenvolvimento ausente');

const verified = await call('/api/v1/auth/login/verify', {
  method: 'POST',
  body: JSON.stringify({ challengeId: challenge.challengeId, code: challenge.developmentCode }),
});
assert(verified?.token, 'JWT ausente após MFA');
const auth = { authorization: `Bearer ${verified.token}` };

console.log('4/10 self profile created with account');
const initialProfiles = await call('/api/v1/profiles', { headers: auth });
const self = Array.isArray(initialProfiles) ? initialProfiles.find((p) => p.relationship === 'self') : null;
assert(self?.id && self?.name === 'Usuário CI MyDoctor', 'perfil próprio não foi criado no cadastro');

console.log('5/10 create dependent profile');
const personInput={ name:'Filho Teste CI',birthDate:'2018-04-12',motherName:'Mãe Teste CI',relationship:'child' };
const personSearch=await call('/api/v1/people/search',{method:'POST',headers:auth,body:JSON.stringify(personInput)});
const profile = await call('/api/v1/profiles', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({...personInput,creationToken:personSearch.creationToken}),
});
assert(profile?.id && profile?.relationship === 'child', 'perfil dependente inválido');

console.log('6/10 list profiles');
const profiles = await call('/api/v1/profiles', { headers: auth });
assert(Array.isArray(profiles) && profiles.some((p) => p.id === self.id), 'perfil próprio não retornou na seleção');
assert(profiles.some((p) => p.id === profile.id), 'dependente não retornou na seleção de perfis');

console.log('7/10 create health event');
const event = await call(`/api/v1/patients/${profile.id}/events`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    type: 'consultation',
    title: 'Consulta pediátrica CI',
    occurredAt: '2026-08-27T14:30:00-03:00',
    organizationName: 'Clínica MyDoctor Teste',
    locationName: 'São Paulo - SP',
    practitionerName: 'Dra. Teste Automático',
    profession: 'Médica Pediatra',
    council: 'CRM',
    registration: '123456',
    registrationRegion: 'SP',
    payload: { followUp:{enabled:true,period:'30',at:'2026-09-26T14:30:00-03:00',alert:true},notes: 'Evento criado automaticamente no teste ponta a ponta da V1.' },
  }),
});
assert(event?.id && event?.patientId === profile.id, 'evento clínico não foi persistido');

assert(event.payload.followUp.at==='2026-09-26T17:30:00.000Z','retorno não preservou data/hora e fuso');
console.log('8/10 create vital sign');
const vital = await call(`/api/v1/patients/${profile.id}/events`, {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    type: 'vital',
    title: 'Pressão arterial: 120/80 mmHg',
    occurredAt: '2026-08-31T17:30:00-03:00',
    payload: {
      vitalType: 'blood_pressure',
      label: 'Pressão arterial',
      value: '120',
      secondaryValue: '80',
      unit: 'mmHg',
      source: 'manual',
      device: 'Esfigmomanômetro teste',
    },
  }),
});
assert(vital?.id && vital?.type === 'vital', 'sinal vital não foi persistido');

console.log('9/10 load timeline');
const events = await call(`/api/v1/patients/${profile.id}/events`, { headers: auth });
const saved = Array.isArray(events) ? events.find((item) => item.id === event.id) : null;
assert(saved, 'evento não apareceu na timeline');
assert(saved.title === 'Consulta pediátrica CI', 'título do evento divergente');
assert(saved.organizationNameSnapshot === 'Clínica MyDoctor Teste', 'instituição não preservada');
assert(saved.practitionerNameSnapshot === 'Dra. Teste Automático', 'profissional não preservado');
assert(saved.councilSnapshot === 'CRM' && saved.registrationSnapshot === '123456', 'registro profissional não preservado');

console.log('10/10 verify vital sign in timeline');
const savedVital = Array.isArray(events) ? events.find((item) => item.id === vital.id) : null;
assert(savedVital?.type === 'vital', 'sinal vital não apareceu na timeline');
assert(savedVital?.payload?.vitalType === 'blood_pressure', 'tipo do sinal vital divergente');
assert(savedVital?.payload?.value === '120' && savedVital?.payload?.secondaryValue === '80', 'valores da pressão arterial divergentes');
assert(savedVital?.payload?.unit === 'mmHg', 'unidade do sinal vital divergente');
assert(savedVital?.payload?.source === 'manual', 'origem do sinal vital divergente');

console.log('✅ V1 E2E OK: cadastro -> MFA -> perfis -> evento -> sinal vital -> timeline persistente');

console.log('Diary: 60-day retention and permanent per-entry deletion');
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const db = require('../dist/db.js').default;
const { retainedDiaryEntries, DIARY_RETENTION_MS } = require('../dist/diary-retention.js');
const now = Date.now();
assert(retainedDiaryEntries({ entries: [{ at: new Date(now - DIARY_RETENTION_MS).toISOString(), text: 'boundary' }] }, now).length === 1, 'limite de 60 dias incorreto');
assert(retainedDiaryEntries({ entries: [{ at: new Date(now - DIARY_RETENTION_MS - 1).toISOString(), text: 'expired' }] }, now).length === 0, 'relato expirado preservado');
const oldAt = new Date(now - 61 * 86400000);
const recentAt = new Date(now).toISOString();
const yesterdayAt = new Date(now - 86400000).toISOString();
const expired = await db.healthEvent.create({ data: { patientId: profile.id, type: 'wellbeing_diary', title: 'expired', occurredAt: oldAt, payload: { entries: [{ at: oldAt.toISOString(), text: 'old diary' }] } } });
const mixed = await db.healthEvent.create({ data: { patientId: profile.id, type: 'wellbeing_diary', title: 'mixed', occurredAt: oldAt, payload: { entries: [{ at: oldAt.toISOString(), text: 'old' }, { at: yesterdayAt, text: 'recent A' }, { at: recentAt, text: 'recent B' }] }, provenance: { previous: { payload: { text: 'old snapshot' } } } } });
const afterPurge = await call('/api/v1/patients/' + profile.id + '/events', { headers: auth });
assert(!afterPurge.some(e => e.id === expired.id), 'dia expirado retornou');
assert(await db.healthEvent.findUnique({ where: { id: expired.id } }) === null, 'dia expirado não foi apagado do banco');
const kept = afterPurge.find(e => e.id === mixed.id);
assert(kept.payload.entries.length === 2 && !JSON.stringify(kept).includes('old snapshot'), 'relato ou snapshot antigo permaneceu');
assert(afterPurge.some(e => e.id === event.id), 'retenção afetou atendimento clínico');
const denied = await fetch(base + '/api/v1/patients/' + profile.id + '/diary/' + mixed.id + '/entries/0', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' });
assert(denied.status === 401, 'exclusão sem autenticação permitida');
const conflict = await fetch(base + '/api/v1/patients/' + profile.id + '/diary/' + mixed.id + '/entries/0', { method: 'DELETE', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ expectedAt: recentAt, expectedText: 'wrong' }) });
assert(conflict.status === 409, 'exclusão concorrente não foi protegida');
await call('/api/v1/patients/' + profile.id + '/diary/' + mixed.id + '/entries/0', { method: 'DELETE', headers: auth, body: JSON.stringify({ expectedAt: yesterdayAt, expectedText: 'recent A' }) });
const updatedDiary = await db.healthEvent.findUnique({ where: { id: mixed.id } });
assert(updatedDiary.payload.entries.length === 1 && !JSON.stringify(updatedDiary).includes('recent A'), 'relato apagado ficou em snapshot');
await call('/api/v1/patients/' + profile.id + '/diary/' + mixed.id + '/entries/0', { method: 'DELETE', headers: auth, body: JSON.stringify({ expectedAt: recentAt, expectedText: 'recent B' }) });
assert(await db.healthEvent.findUnique({ where: { id: mixed.id } }) === null, 'último relato não removeu o dia');
const noConsent = await fetch(base + '/api/v1/patients/' + profile.id + '/consultant', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ question: 'Como preparar minha consulta?' }) });
assert(noConsent.status === 400, 'consultor aceitou envio sem consentimento');
// Reproduzir exatamente o schema anterior SOMENTE no PostgreSQL descartável do CI.
assert(process.env.NODE_ENV === 'test' && ['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname), 'teste de schema requer banco local de teste');
const { Client } = require('pg');
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const delegateOwner = await db.user.create({ data: { name: 'Dono delegado CI', email: 'schema-' + Date.now() + '@mydoctor.test', passwordHash: 'test-unused' } });
const delegated = await db.patient.create({ data: { id: 'schema-' + Date.now(), ownerUserId: delegateOwner.id, name: 'Perfil delegado CI', data: {} } });
await db.accessGrant.create({ data: { accountId: registered.id, patientId: delegated.id, level: 'leitura' } });
let startupProcess;
try {
  await pg.query('ALTER TABLE "Patient" DROP COLUMN "medicationAlertsEnabled"');
  await pg.query('ALTER TABLE "MedicationSchedule" DROP COLUMN "continuousUse"');
  const oldSchemaProfiles = await call('/api/v1/profiles', { headers: auth });
  assert(oldSchemaProfiles.some(p => p.id === self.id) && oldSchemaProfiles.some(p => p.id === delegated.id), 'schema antigo bloqueou perfis próprios/delegados');
  const oldSchemaEvents = await call('/api/v1/patients/' + profile.id + '/events', { headers: auth });
  assert(oldSchemaEvents.some(e => e.id === event.id), 'schema antigo bloqueou prontuário');
  const { spawn } = await import('node:child_process');
  const { setTimeout: delay } = await import('node:timers/promises');
  startupProcess = spawn(process.execPath, ['../index.js'], { env: { ...process.env, NODE_ENV: 'test', PORT: '8790' }, stdio: 'inherit' });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:8790/api/health')).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert(ready, 'entrypoint não iniciou após preparar schema antigo');
  const restored = await pg.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Patient' AND column_name = 'medicationAlertsEnabled'");
  assert(restored.rowCount === 1, 'entrypoint não restaurou coluna ausente');
  const modeRestored = await pg.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'MedicationSchedule' AND column_name = 'continuousUse'");
  assert(modeRestored.rowCount === 1, 'entrypoint não restaurou coluna de uso contínuo');
  const preserved = await db.patient.findUnique({ where: { id: profile.id } });
  assert(preserved.name === 'Filho Teste CI' && preserved.medicationAlertsEnabled === false, 'patch alterou dados antigos');
  console.log('✅ Schema antigo: perfis próprios/delegados e prontuário funcionam; entrypoint repara coluna antes de iniciar HTTP, mesmo com NODE_ENV=test.');
} finally {
  if (startupProcess && startupProcess.exitCode === null) startupProcess.kill();
  // Restauração garantida mesmo se o teste falhar.
  await pg.query('ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "medicationAlertsEnabled" BOOLEAN NOT NULL DEFAULT false');
  await pg.query('ALTER TABLE "MedicationSchedule" ADD COLUMN IF NOT EXISTS "continuousUse" BOOLEAN NOT NULL DEFAULT false');
  await pg.end();
  await db.user.delete({ where: { id: delegateOwner.id } });
}
await db.$disconnect();
console.log('✅ Diary retention, deletion and Consultant consent OK');




