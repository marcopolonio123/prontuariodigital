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
