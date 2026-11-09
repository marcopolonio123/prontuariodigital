import assert from 'node:assert/strict';
import {lookupCnes} from '../dist/cnes-directory.js';
import {searchMedicationCatalog,verifiedMedication} from '../dist/medication-catalog.js';

const source = {codigo_cnes:12345,nome_fantasia:'Hospital fictício',endereco_estabelecimento:'Rua da unidade',numero_estabelecimento:'12',codigo_cep_estabelecimento:'01001000',codigo_uf:35,codigo_municipio:355030,codigo_tipo_unidade:5};
const postal = {cep:'01001-000',localidade:'São Paulo',uf:'SP',ibge:'3550308',logradouro:'Não deve substituir o logradouro CNES'};
const lookup=(changes={},address=postal)=>lookupCnes('0012345',async url=>{
  if(url==='https://apidadosabertos.saude.gov.br/cnes/estabelecimentos/0012345')return Response.json({...source,...changes});
  assert.equal(url,'https://viacep.com.br/ws/01001000/json/');
  return Response.json(address);
});
const facility=await lookup();
assert.equal(facility.code,'0012345');
assert.equal(facility.fullAddress.street,source.endereco_estabelecimento);
assert.equal(facility.fullAddress.city,'São Paulo');
await assert.rejects(lookup({codigo_cnes:123456}),error=>error.status===503);
await assert.rejects(lookup({codigo_motivo_desabilitacao_estabelecimento:'02'}),error=>error.status===422);
await assert.rejects(lookup({}, {...postal,ibge:'3518800'}),error=>error.status===503);
await assert.rejects(lookupCnes('http://exemplo',()=>assert.fail('Invalid input must not cause network access')),error=>error.status===400);
const results=searchMedicationCatalog('paracetamol');
assert(results.items.length>0 && results.items.length<=15);
const byId=verifiedMedication(results.items[0].registration);
assert.equal(byId.name,results.items[0].name);
assert.equal(searchMedicationCatalog(byId.medicationRegistration).items.length,1);
assert.throws(()=>verifiedMedication('000000000'),error=>error.status===422);
assert.throws(()=>searchMedicationCatalog('a'),error=>error.status===400);
console.log('CNES: código, inativação e coerência municipal; Anvisa: busca, edição oficial e ID de produto conferidos.');
