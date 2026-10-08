import {cleanupTutorshipFixtures} from './tutorship-fixtures.mjs';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
process.env.PORT = '8789';
process.env.MEDICATION_REMINDERS_ENABLED = 'false';
await import('../dist/index.js');
const { prisma: db } = await import('../dist/db.js');
const { parseSchedule, dueSlots } = await import('../dist/medication-schedule.js');
const { dispatchMedicationReminders } = await import('../dist/medication-reminders.js');
const accounts = [];
const base = 'http://127.0.0.1:8789/api/v1';
async function call(path, body, token, method) {
  const response = await fetch(base + path, { method: method ?? (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function account(name) {
  const email = `medication-${Date.now()}-${accounts.length}@mydoctor.test`;
  const password = 'Teste123!';
  const created = await call('/auth/register', { name, email, password });
  assert.equal(created.status, 201); accounts.push(created.body.id);
  const challenge = await call('/auth/login/start', { email, password, channel: 'email' });
  const login = await call('/auth/login/verify', { challengeId: challenge.body.challengeId, code: challenge.body.developmentCode });
  return { id: created.body.id, token: login.body.token, email };
}
try {
  for (let i = 0; i < 30; i++) { try { await fetch('http://127.0.0.1:8789/api/health'); break; } catch { await delay(100); } }
  const basic = { name: 'Medicamento teste', dose: 'Conforme prescrição de teste', weekdays: [0, 1, 2, 3, 4, 5, 6], times: ['08:00'], timezone: 'America/Sao_Paulo', startsOn: '2026-09-30', endsOn: null, recipientIds: [], alertsEnabled: false };
  const continuous = parseSchedule({ ...basic, continuousUse: true, startsOn: undefined, endsOn: 'invalid-date' });
  assert.equal(continuous.continuousUse, true);
  assert.equal(continuous.endsOn, null);
  assert.match(continuous.startsOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dueSlots({ ...continuous, startsOn: '2099-01-01' }, new Date('2026-09-30T11:00:00Z')).length, 1, 'uso contínuo não depende de datas');
  assert.throws(() => parseSchedule({ ...basic, times: ['24:00'] }));
  assert.throws(() => parseSchedule({ ...basic, weekdays: [7] }));
  assert.throws(() => parseSchedule({ ...basic, timezone: 'invalid-zone' }));
  assert.throws(() => parseSchedule({ ...basic, startsOn: '2026-02-30' }));
  assert.throws(() => parseSchedule({ ...basic, endsOn: '2026-09-29' }));
  assert.equal(dueSlots(basic, new Date('2026-09-30T11:00:00Z')).length, 1);
  assert.equal(dueSlots({ ...basic, weekdays: [1] }, new Date('2026-09-30T11:00:00Z')).length, 0);
  assert.equal(dueSlots(basic, new Date('2026-09-30T11:15:00Z')).length, 0, 'não disparar aviso antigo');
  const dst = { ...basic, timezone: 'America/New_York', startsOn: '2026-11-01', times: ['01:30'] };
  assert.equal(dueSlots(dst, new Date('2026-11-01T05:30:00Z'))[0].slotKey, dueSlots(dst, new Date('2026-11-01T06:30:00Z'))[0].slotKey, 'horário repetido não deve criar dois lembretes');
  const owner = await account('Responsável teste');
  const dependentUser = await account('Dependente teste');
  const stranger = await account('Outra conta teste');
  const input={name:'Dependente teste',relationship:'child',birthDate:'2018-05-16',motherName:'Mãe medicamento teste'};
  const search=await call('/people/search',input,owner.token);
  const profile = await call('/profiles', {...input,creationToken:search.body.creationToken}, owner.token);
  const patientId = profile.body.id;
  const endpoint = '/patients/' + patientId + '/medications';
  const grant = await db.accessGrant.create({ data: { accountId: dependentUser.id, patientId, level: 'leitura', scope: ['record'] } });
  assert.equal((await call(endpoint)).status, 401);
  assert.equal((await call(endpoint, null, stranger.token)).status, 403);
  const originalPatient = await db.patient.findUnique({ where: { id: patientId } });
  const originalData = { ...originalPatient.data, medications: [{ id: 'legacy-medication', name: basic.name, dose: 'Dose antiga', frequency: 'Diariamente' }] };
  await db.patient.update({ where: { id: patientId }, data: { data: originalData } });
  const agenda = await call(endpoint, null, owner.token);
  assert.deepEqual(agenda.body.registeredMedications, [{ name: basic.name, dose: 'Dose antiga', frequency: 'Diariamente' }]);
  assert.equal(agenda.body.alertsEnabled, false);
  assert(agenda.body.recipients.some(user => user.id === owner.id));
  assert(agenda.body.recipients.some(user => user.id === dependentUser.id));
  assert(!agenda.body.recipients.some(user => user.id === stranger.id));
  assert.equal((await call(endpoint, basic, dependentUser.token)).status, 403, 'leitura não pode criar medicamento');
  assert.equal((await call(endpoint, { ...basic, recipientIds: [stranger.id] }, owner.token)).status, 400);
  const regular = await call(endpoint, { ...basic, continuousUse: true, startsOn: undefined, endsOn: undefined }, owner.token);
  assert.equal(regular.status, 201, 'uso contínuo exigiu data do usuário');
  assert.equal(regular.body.continuousUse, true); assert.equal(regular.body.endsOn, null);
  const regularSaved = await call(endpoint, null, owner.token);
  assert.equal(regularSaved.body.schedules.find(item => item.id === regular.body.id).continuousUse, true, 'uso contínuo não persistiu');
  const dated = await call(endpoint + '/' + regular.body.id, { ...basic, continuousUse: false, expectedUpdatedAt: regular.body.updatedAt }, owner.token, 'PUT');
  assert.equal(dated.status, 200); assert.equal(dated.body.continuousUse, false);
  await call(endpoint + '/' + regular.body.id, null, owner.token, 'DELETE');
  const now = new Date(Math.floor(Date.now() / 60000) * 60000);
  const today = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16);
  const input = { ...basic, timezone: 'UTC', startsOn: today, times: [time], recipientIds: [owner.id, dependentUser.id], alertsEnabled: true };
  const created = await call(endpoint, input, owner.token);
  assert.equal(created.status, 201);
  assert.equal((await call(endpoint, null, owner.token)).body.deliveryAvailable, false, 'não anunciar transporte mobile antes da integração');
  assert.equal(await dispatchMedicationReminders(now), 0, 'não enviar e-mail sem transporte explícito');
  const sent = [];
  const sender = async message => { await delay(30); sent.push(message); };
  assert.equal(await dispatchMedicationReminders(now, sender), 0, 'perfil desligado enviou avisos');
  assert.equal((await call(endpoint + '/alerts', { enabled: true }, owner.token, 'PUT')).status, 200);
  await Promise.all([dispatchMedicationReminders(now, sender), dispatchMedicationReminders(now, sender)]);
  assert.equal(sent.length, 2, 'paciente e responsável devem receber uma vez');
  assert(sent.some(message => message.to === owner.email));
  assert(sent.some(message => message.to === dependentUser.email));
  assert.equal(await dispatchMedicationReminders(now, sender), 0, 'reprocessamento duplicou aviso');
  assert.equal((await call(endpoint + '/' + created.body.id, { ...input, expectedUpdatedAt: '2000-01-01T00:00:00Z' }, owner.token, 'PUT')).status, 409);
  const next = new Date(now.getTime() + 60000);
  const nextInput = { ...input, startsOn: today, times: [next.toISOString().slice(11, 16)] };
  const edited = await call(endpoint + '/' + created.body.id, { ...nextInput, expectedUpdatedAt: created.body.updatedAt }, owner.token, 'PUT');
  assert.equal(edited.status, 200);
  await db.accessGrant.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
  await call(endpoint + '/alerts', { enabled: false }, owner.token, 'PUT');
  assert.equal(await dispatchMedicationReminders(next, sender), 0);
  await call(endpoint + '/alerts', { enabled: true }, owner.token, 'PUT');
  let failure = true;
  const flakySender = async message => { if (failure) throw new Error('simulated'); sent.push(message); };
  assert.equal(await dispatchMedicationReminders(next, flakySender), 0);
  failure = false;
  assert.equal(await dispatchMedicationReminders(new Date(next.getTime() + 60000), flakySender), 1, 'falha deve repetir apenas para destinatário autorizado');
  assert.equal(sent.length, 3, 'destinatário revogado recebeu aviso');
  assert.equal((await call(endpoint + '/' + created.body.id, null, owner.token, 'DELETE')).status, 200);
  assert.equal((await call(endpoint, null, owner.token)).body.schedules.length, 0);
  assert.equal(await dispatchMedicationReminders(new Date(next.getTime() + 60000), sender), 0);
  assert.deepEqual((await db.patient.findUnique({ where: { id: patientId } })).data.medications, originalData.medications, 'agenda alterou o cadastro antigo');
  assert.equal((await call(endpoint, null, owner.token)).body.registeredMedications.length, 1);
  console.log('✅ Agenda: validação, fuso/DST, dependente e responsável, concorrência, desligamento, revogação, edição e remoção OK (e-mail simulado).');
} finally {
  await cleanupTutorshipFixtures(db,accounts);
  await db.user.deleteMany({ where: { id: { in: accounts } } });
  await db.$disconnect();
}
process.exit(0);



