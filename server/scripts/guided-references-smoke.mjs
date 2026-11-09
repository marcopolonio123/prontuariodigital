import assert from 'node:assert/strict';
import {knownCity,searchCities,searchAns,validatedInsurance} from '../dist/guided-references.js';
import {searchCnesUnits} from '../dist/cnes-directory.js';

assert(searchCities('SP','sao paulo').some(city=>city.code==='3550308'));
assert.equal(knownCity('3550308').uf,'SP');
assert.throws(()=>knownCity('0000000'),e=>e.status===400);
const units=await searchCnesUnits('3550308','hospital',20,async url=>{
  const q=new URL(url).searchParams;
  assert.equal(q.get('codigo_municipio'),'355030');
  assert.equal(q.get('status'),'1');
  assert.equal(q.get('offset'),'20');
  return Response.json({estabelecimentos:[
    {codigo_cnes:3210,codigo_municipio:355030,nome_fantasia:'Hospital de teste'},
    {codigo_cnes:6789,codigo_municipio:330455,nome_fantasia:'Hospital fora da cidade'},
    {codigo_cnes:4321,codigo_municipio:355030,nome_fantasia:'Clínica de teste'},
  ]});
});
assert.deepEqual(units.items.map(x=>x.code),['0003210']);
assert.equal(units.nextOffset,null);
await assert.rejects(searchCnesUnits('3550308','hospital',1,()=>assert.fail('invalid page')),e=>e.status===400);

const operator=searchAns('006246').items[0],plan=searchAns('496356233',operator.code).items[0];
assert.equal(plan.code,'496356233');
const input={provider:operator.name,planName:plan.name,operatorAnsCode:operator.code,planAnsCode:plan.code,memberNumber:'000012345'};
const saved=validatedInsurance({...input,ansEdition:'inventada'});
assert.equal(saved.memberNumber,'000012345');
assert.notEqual(saved.ansEdition,'inventada');
assert.throws(()=>validatedInsurance({...input,operatorAnsCode:'419761'}),e=>e.status===422);
assert.throws(()=>validatedInsurance({...input,planName:'Outro nome'}),e=>e.status===422);
assert.equal(validatedInsurance({provider:'Convênio manual',memberNumber:'ABC'}).operatorAnsCode,null);
console.log('Busca CNES por município e nome, seleção ANS e rejeição de vínculos divergentes OK.');
