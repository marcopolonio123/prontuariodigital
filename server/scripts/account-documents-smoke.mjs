import assert from 'node:assert/strict';
process.env.PORT = '8794'; process.env.MYDOCTOR_ADMIN_EMAILS = '';
await import('../dist/index.js');
const { prisma: db } = await import('../dist/db.js');
const base = 'http://127.0.0.1:8794/api/v1';
const users = [];
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
async function account(professional = false) {
  const email = `flow-${Date.now()}-${users.length}@mydoctor.test`; const password = 'Teste123!';
  const registered = await call('/auth/register', null, { name: 'Pessoa teste', email, password, isHealthProfessional: professional }); assert.equal(registered.status, 201); users.push(registered.body.id);
  const start = await call('/auth/login/start', null, { email, password, channel: 'email' });
  const login = await call('/auth/login/verify', null, { challengeId: start.body.challengeId, code: start.body.developmentCode }); assert.equal(login.status, 200);
  return { id: registered.body.id, email, token: login.body.token };
}
try {
  const owner = await account(true); const other = await account(); const admin = await account(); process.env.MYDOCTOR_ADMIN_EMAILS = admin.email;
  assert.equal((await call('/account')).status, 401);
  let initial = await call('/account', owner.token); assert.equal(initial.body.isHealthProfessional, true); assert.equal(initial.body.completed, false);
  const data = { name: 'Nome atualizado', birthDate: '1980-03-12', sex: 'female', city: 'São Paulo', state: 'SP', phone: '', isHealthProfessional: true, cpf: '529.982.247-25', rg: '12.345.678-X', postalCode: '01310-100', street: 'Avenida teste', number: '120', complement: 'Apto 4', neighborhood: 'Bairro teste', country: 'Brasil', avatarDataUrl: 'data:image/jpeg;base64,' + Buffer.from([255,216,255,224,0,0,255,217]).toString('base64') };
  assert.equal((await call('/account', owner.token, { ...data, birthDate: '2026-02-31' }, 'PUT')).status, 400);
  assert.equal((await call('/account', owner.token, { ...data, cpf: '111.111.111-11' }, 'PUT')).status, 400);
  assert.equal((await call('/account', owner.token, { ...data, avatarDataUrl: 'https://example.com/photo.jpg' }, 'PUT')).status, 400);
  const saved = await call('/account', owner.token, data, 'PUT'); assert.equal(saved.status, 200); assert.equal(saved.body.completed, true); assert.equal(saved.body.avatarDataUrl, data.avatarDataUrl); assert.equal(saved.body.cpf, '52998224725'); assert.equal(saved.body.street, data.street); assert.equal(saved.body.postalCode, '01310100');
  assert.equal((await call('/account', owner.token)).body.rg, data.rg);
  assert.equal((await call('/account', other.token)).body.cpf, '');
  const identityInput = { kind: 'CNH', filename: 'cnh.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4\nCNH de teste\n%%EOF').toString('base64'), expectedId: null };
  const identity = await call('/account/document', owner.token, identityInput); assert.equal(identity.status, 201);
  assert.equal((await call('/account/document', other.token)).body, null);
  assert.equal((await call(`/account/documents/${identity.body.id}/download`, other.token)).status, 404);
  assert.equal((await call(`/admin/account/documents/${identity.body.id}/download`, admin.token)).status, 404, 'Documento de paciente sem perfil profissional ficou acessível à administração');
  assert.equal((await call('/account/document', owner.token, identityInput)).status, 409, 'Substituição concorrente sem versão foi aceita');
  const self = (await call('/profiles', owner.token)).body.find(p => p.relationship === 'self'); assert.equal(self.name, data.name);
  assert.equal((await call('/account', other.token)).body.name, 'Pessoa teste');
  const professional = await call('/professional/profile', owner.token, { profession: 'Médico', council: 'CRM', registration: String(Date.now()), region: 'SP' }, 'PUT'); assert.equal(professional.status, 200);
  const input = { kind: 'identity', filename: 'identidade.pdf', mimeType: 'application/pdf', data: Buffer.from('%PDF-1.4\nDocumento de teste\n%%EOF').toString('base64') };
  assert.equal((await call('/professional/documents', owner.token, { ...input, data: Buffer.from('arquivo falso').toString('base64') })).status, 400);
  let uploaded = await call('/professional/documents', owner.token, input); assert.equal(uploaded.status, 201); const docId = uploaded.body.id;
  assert.equal((await call('/professional/documents', other.token)).body.length, 0);
  assert.equal((await call(`/professional/documents/${docId}/download`, other.token)).status, 404);
  assert.equal((await call(`/admin/documents/${docId}/download`, other.token)).status, 403);
  const download = await fetch(base + `/admin/documents/${docId}/download`, { headers: { authorization: 'Bearer ' + admin.token } }); assert.equal(download.status, 200); assert.match(await download.text(), /Documento de teste/); assert.equal(download.headers.get('cache-control'), 'private, no-store');
  let row = (await call('/admin/professionals', admin.token)).body.find(p => p.id === professional.body.id); assert.equal(row.documents.length, 2); assert.equal(row.documents[0].content, undefined);
  const identityDownload = await fetch(base + `/admin/account/documents/${identity.body.id}/download`, { headers: { authorization: 'Bearer ' + admin.token } }); assert.equal(identityDownload.status, 200);
  assert.match(await identityDownload.text(), /CNH de teste/);
  assert.equal(row.documents.some(doc => doc.id === 'account:' + identity.body.id), true);
  const decision = { decision: 'approve', note: 'Teste de validação', evidence: 'Conferência simulada de identidade e conselho', checkedIdentityAndCouncil: true, registrationId: row.registrations[0].id, expectedUpdatedAt: row.updatedAt };
  assert.equal((await call(`/admin/professionals/${row.id}/decision`, admin.token, decision)).status, 200);
  const replaced = await call('/account/document', owner.token, { ...identityInput, kind: 'Passaporte', expectedId: identity.body.id }); assert.equal(replaced.status, 201);
  assert.equal((await call(`/account/documents/${identity.body.id}/download`, owner.token)).status, 404);
  assert.equal((await call('/professional/profile', owner.token)).body.verificationStatus, 'pending');
  uploaded = await call('/professional/documents', owner.token, { ...input, kind: 'council', filename: 'conselho.pdf' }); assert.equal(uploaded.status, 201);
  assert.equal((await call('/professional/profile', owner.token)).body.verificationStatus, 'pending');
  assert.equal((await call(`/admin/professionals/${row.id}/decision`, admin.token, decision)).status, 409, 'documento novo não invalidou análise antiga');
  assert.equal((await call(`/professional/documents/${docId}`, other.token, null, 'DELETE')).status, 404);
  assert.equal((await call(`/professional/documents/${docId}`, owner.token, null, 'DELETE')).status, 200);
  assert.equal((await call(`/professional/documents/${docId}/download`, owner.token)).status, 404);
  const record = await db.patient.findUnique({ where: { id: self.id } }); await db.patient.update({ where: { id: self.id }, data: { data: { ...record.data, allergies: ['Registro preservado'] } } });
  assert.equal((await call('/account', owner.token, { ...data, city: 'Santos' }, 'PUT')).status, 200);
  assert.equal((await db.patient.findUnique({ where: { id: self.id } })).data.cpf, undefined, 'CPF vazou para prontuário compartilhado');
  assert.equal((await db.patient.findUnique({ where: { id: self.id } })).data.street, undefined, 'Endereço vazou para prontuário compartilhado');
  assert.equal((await call(`/account/documents/${replaced.body.id}`, other.token, null, 'DELETE')).status, 404);
  assert.equal((await call(`/account/documents/${replaced.body.id}`, owner.token, null, 'DELETE')).status, 200);
  assert.deepEqual((await db.patient.findUnique({ where: { id: self.id } })).data.allergies, ['Registro preservado']);
  console.log('✅ Cadastro e documentos: primeiro acesso, flag profissional, edição, preservação de prontuário, anexos privados, análise administrativa e nova validação OK.');
} finally {
  await db.practitioner.deleteMany({ where: { userId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
}
process.exit(0);
