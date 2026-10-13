import assert from 'node:assert/strict';
import {testConsultantConnection as test} from '../dist/consultant-connection.js';
const base='https://generativelanguage.googleapis.com/v1beta/openai',model='gemini-3.5-flash-lite';
let calls=[];
const mock=async(url,options)=>{calls.push({url,options});if(String(url).includes('/models?'))return Response.json({models:[{name:'models/'+model}]});if(String(url).endsWith(':generateContent'))return Response.json({candidates:[{content:{parts:[{text:'TESTE_OK'}]}}]});return Response.json({choices:[{message:{content:'TESTE_OK'}}]});};
const good=await test(base,model,'private-test-key',mock);assert.equal(good.ok,true);assert.equal(good.steps.length,3);
assert.equal(calls[0].options.headers['x-goog-api-key'],'private-test-key');
assert.equal(JSON.parse(calls[2].options.body).reasoning_effort,'minimal');
assert.ok(!JSON.stringify(good).includes('private-test-key'));
assert.ok(calls.every(call=>!String(call.options.body).includes('prontuário')));
calls=[];const missing=await test(base,'missing-model','secret',mock);assert.equal(missing.ok,false);assert.equal(calls.length,1);assert.deepEqual(missing.availableModels,[model]);
const nativeFailed=await test(base,model,'secret',async(url,options)=>String(url).endsWith(':generateContent')?new Response('{}',{status:503}):mock(url,options));
assert.equal(nativeFailed.ok,false);assert.equal(nativeFailed.steps[1].ok,false);assert.equal(nativeFailed.steps[2].ok,true);
const timeout=await test(base,model,'secret',async()=>{throw new DOMException('secret','TimeoutError')});assert.match(timeout.steps[0].message,/Tempo/);assert.ok(!JSON.stringify(timeout).includes('secret'));
const denied=await test(base,model,'secret',async()=>Response.json({error:{code:'invalid_api_key',message:'secret'}},{status:401}));assert.match(denied.steps[0].message,/chave/);assert.ok(!JSON.stringify(denied).includes('secret'));
const malformed=await test(base,model,'secret',async()=>new Response('<html>secret</html>'));assert.match(malformed.steps[0].message,/formato/);
console.log('Connection diagnostics: model discovery, native/compatible comparison, timeouts and secret redaction passed.');

assert.deepEqual(good.testableModels,[model]);

const {diagnosticProviderDetail}=await import('../dist/consultant-connection.js');
const safe=diagnosticProviderDetail({error:{message:'Invalid reasoning_effort minimal; key=secret-value; Bearer other-secret; sk-testanothersecret; https://example.test/path?key=secret-value'}},'secret-value');
assert.match(safe,/reasoning_effort minimal/);assert.ok(!safe.includes('secret-value'));assert.ok(!safe.includes('other-secret'));assert.ok(!safe.includes('sk-testanothersecret'));assert.ok(!safe.includes('?key='));
assert.equal(diagnosticProviderDetail(null,'secret'),'');
const badArgument=await test(base,model,'private-test-key',async(url,options)=>String(url).endsWith('/chat/completions')?Response.json({error:{message:'Unsupported reasoning_effort value minimal. private-test-key'}},{status:400}):mock(url,options));
assert.match(badArgument.steps[2].message,/Unsupported reasoning_effort/);assert.ok(!JSON.stringify(badArgument).includes('private-test-key'));
console.log('Admin-only provider detail preserves parameter diagnostics while redacting credentials and URLs.');
