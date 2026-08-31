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
const profile = await call('/api/v1/profiles', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Filho Teste CI', relationship: 'child' }),
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
    payload: { notes: 'Evento criado automaticamente no teste ponta a ponta da V1.' },
  }),
});
assert(event?.id && event?.patientId === profile.id, 'evento clínico não foi persistido');

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
