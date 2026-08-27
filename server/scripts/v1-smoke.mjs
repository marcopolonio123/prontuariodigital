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

console.log('1/7 health');
const health = await call('/api/health');
assert(health?.ok === true && health?.apiV1 === true, 'API V1 deve estar ativa');

console.log('2/7 register');
await call('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ name: 'Usuário CI MyDoctor', email, password }),
});

console.log('3/7 MFA start + verify');
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

console.log('4/7 create dependent profile');
const profile = await call('/api/v1/profiles', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ name: 'Filho Teste CI', relationship: 'child' }),
});
assert(profile?.id && profile?.relationship === 'child', 'perfil dependente inválido');

console.log('5/7 list profiles');
const profiles = await call('/api/v1/profiles', { headers: auth });
assert(Array.isArray(profiles) && profiles.some((p) => p.id === profile.id), 'dependente não retornou na seleção de perfis');

console.log('6/7 create health event');
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

console.log('7/7 load timeline');
const events = await call(`/api/v1/patients/${profile.id}/events`, { headers: auth });
const saved = Array.isArray(events) ? events.find((item) => item.id === event.id) : null;
assert(saved, 'evento não apareceu na timeline');
assert(saved.title === 'Consulta pediátrica CI', 'título do evento divergente');
assert(saved.organizationNameSnapshot === 'Clínica MyDoctor Teste', 'instituição não preservada');
assert(saved.practitionerNameSnapshot === 'Dra. Teste Automático', 'profissional não preservado');
assert(saved.councilSnapshot === 'CRM' && saved.registrationSnapshot === '123456', 'registro profissional não preservado');

console.log('✅ V1 E2E OK: cadastro -> MFA -> dependente -> evento -> timeline');
