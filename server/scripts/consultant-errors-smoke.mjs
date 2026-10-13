import assert from 'node:assert/strict';
import { consultantProviderFailure as classify } from '../dist/consultant-errors.js';
const error = (status, code, type, message='sensitive-key-and-medical-input') => Response.json({error:{code,type,message}}, {status});
for (const [status,code,type,expected] of [
  [401,'invalid_api_key','invalid_request_error',/chave de API/],
  [429,'insufficient_quota','insufficient_quota',/falta de cota/],
  [429,'credit_balance_exhausted','insufficient_quota',/créditos da API acabaram/],
  [429,'project_spend_limit_exceeded','insufficient_quota',/gastos do projeto/],
  [429,'organization_spend_limit_exceeded','insufficient_quota',/gastos da organização/],
  [429,'organization_usage_limit_exceeded','insufficient_quota',/uso da organização/],
  [429,'rate_limit_exceeded','rate_limit_error',/limite de solicitações/],
  [404,'model_not_found','invalid_request_error',/modelo configurado/],
  [403,'permission_denied','invalid_request_error',/negou acesso/],
  [400,'unsupported_parameter','invalid_request_error',/formato da solicitação/],
  [503,'server_is_overloaded','service_unavailable_error',/temporariamente indisponível/],
]) {
 const result=await classify(error(status,code,type),false);
 assert.match(result.message,expected);assert.match(result.message,/Nenhum uso foi descontado/);
 assert.equal(result.status,status===429||status>=500?503:502);
 assert.ok(!result.message.includes('sensitive-key-and-medical-input'));
}
assert.match((await classify(error(400,'unknown',''),true)).message,/não aceitou as imagens/);
assert.match((await classify(error(401,'invalid_api_key',''),true)).message,/chave de API/);
assert.match((await classify(new Response('<html>secret</html>',{status:404}),false)).message,/URL da API/);
const unknown=await classify(error(418,'secret_arbitrary_code',''),false);
assert.ok(!unknown.message.includes('secret'));assert.match(unknown.message,/IA-418/);
console.log('Consultant error diagnostics: credentials, billing, limits, model, images, non-JSON and sensitive-data redaction passed.');
const {consultantGenerationOptions:options}=await import('../dist/consultant-provider.js');
assert.deepEqual(options('https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.5-flash-lite',true),{max_tokens:2048,reasoning_effort:'minimal'});
assert.deepEqual(options('https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.5-flash-lite',false),{max_tokens:4096,reasoning_effort:'minimal'});
assert.deepEqual(options('https://generativelanguage.googleapis.com/v1beta/openai','gemini-2.5-flash-lite',true),{max_tokens:20,reasoning_effort:'none'});
assert.deepEqual(options('https://api.openai.com/v1','gpt-4.1-mini',true),{max_tokens:20});
assert.deepEqual(options('https://mydoctor-provider.test/v1','mock',false),{max_tokens:700});
assert.deepEqual(options('https://generativelanguage.googleapis.com.attacker.test/v1','gemini-3.5-flash-lite',true),{max_tokens:20});
console.log('Gemini request budgets and provider-specific reasoning settings passed.');

assert.deepEqual(options('https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.8-flash',true),{max_tokens:2048,reasoning_effort:'low'});
assert.equal(options('https://generativelanguage.googleapis.com/v1beta/openai','gemini-3.6-flash',true).reasoning_effort,'minimal');
