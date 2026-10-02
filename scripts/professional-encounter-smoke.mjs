import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { Simulate } = require('react-dom/test-utils');
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://mydoctor.test' });
for (const key of ['window','document','navigator','HTMLElement','Event']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const outfile = '.encounter-test.cjs';
await build({entryPoints:['src/components/ProfessionalEncounterEditor.tsx'],outfile,bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom']});
const Editor = require('../'+outfile).default;
const root = createRoot(document.getElementById('root'));
let record, created = 0, sent = 0, changes = 0, busy = false;
const api = {
  createProfessionalConsultation: async input => { created++; assert.equal(input.accessRequestId,'grant-for-marco'); record = {id:'event1',patientId:'marco',patientName:'Marco',type:input.type,title:input.title,occurredAt:input.occurredAt,status:'draft',updatedAt:'2026-10-01T12:00:00.000Z',payload:{notes:input.notes,homeVisit:input.homeVisit,onlineVisit:input.onlineVisit},documents:[],editable:true,canSubmit:true}; return record; },
  getProfessionalConsultation: async () => structuredClone(record),
  updateProfessionalConsultation: async (id,input) => { assert.equal(id,'event1'); if(record.status==='final')throw Error('O paciente já aprovou este atendimento.'); changes++; record={...record,title:input.title,payload:{notes:input.notes,homeVisit:input.homeVisit,onlineVisit:input.onlineVisit},updatedAt:'2026-10-01T12:02:00.000Z'}; return record; },
  submitProfessionalConsultation: async (id,version) => { assert.equal(id,'event1');assert.equal(version,record.updatedAt);sent++;record={...record,status:'pending_patient_confirmation',canSubmit:false,updatedAt:'2026-10-01T12:01:00.000Z'};return record; },
};
async function settle(work) {await act(async()=>{work?.();await new Promise(resolve=>setTimeout(resolve,15));});}
const button = text => [...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);
const field = label => [...document.querySelectorAll('label')].find(x=>x.textContent.startsWith(label)).querySelector('input,textarea');
try {
  await settle(()=>root.render(React.createElement(Editor,{api,accessRequestId:'grant-for-marco',patientName:'Marco',profile:null,locations:[{id:'loc1',name:'Consultório teste'}],onSaved:async()=>{},onBusy:value=>{busy=value;}})));
  assert.equal(button('Enviar para aprovação'),undefined);
  await settle(()=>Simulate.change(field('Atendimento (descrição)'),{target:{value:'Consulta teste'}}));
  const locationSelect=[...document.querySelectorAll('label')].find(x=>x.textContent.startsWith('Selecionar local cadastrado')).querySelector('select');
  await settle(()=>Simulate.change(locationSelect,{target:{value:'Consultório teste'}}));
  assert.equal(field('Hospital/Clínica/Consultório').value,'Consultório teste');
  const homeCheckbox = document.querySelector('input[type=checkbox]');
  assert.equal(homeCheckbox.checked,false);
  await settle(()=>Simulate.change(homeCheckbox,{target:{checked:true}}));
  await settle(()=>button('Salvar atendimento').click());
  assert.equal(record.payload.homeVisit,true);
  assert.equal(document.querySelector('input[type=checkbox]').checked,true);
  assert.equal(created,1);assert.equal(sent,0);assert.equal(record.status,'draft');assert.equal(busy,false);
  assert.equal(button('Enviar para aprovação').disabled,false);
  await settle(()=>Simulate.change(field('Atendimento (descrição)'),{target:{value:'Consulta revisada'}}));
  assert.equal(button('Enviar para aprovação').disabled,true,'Enviou texto não salvo');
  const onlineCheckbox=document.querySelectorAll('input[type=checkbox]')[1];
  await settle(()=>Simulate.change(onlineCheckbox,{target:{checked:true}}));
  assert.equal(document.querySelector('input[type=checkbox]').checked,false,'On-line e domiciliar simultâneos');
  assert.equal(field('Hospital/Clínica/Consultório').disabled,true);
  await settle(()=>button('Salvar alterações').click());
  assert.equal(record.payload.onlineVisit,true);
  assert.equal(changes,1);assert.equal(created,1,'Duplicou registro durante edição');
  await settle(()=>button('Enviar para aprovação').click());
  assert.equal(sent,1);assert.equal(record.status,'pending_patient_confirmation');
  assert.ok(button('Salvar alterações'),'Pendência bloqueou edição do médico');
  record={...record,status:'final',editable:false,canSubmit:false};
  await settle(()=>Simulate.change(field('Atendimento (descrição)'),{target:{value:'Alteração após aprovação'}}));
  await settle(()=>button('Salvar alterações').click());
  assert.equal(changes,1);assert.equal(record.title,'Consulta revisada');
  assert.match(document.body.textContent,/Aprovado — somente consulta/);
  assert.match(document.body.textContent,/Atendimento on-line/);
  assert.equal(button('Salvar alterações'),undefined);assert.equal(document.querySelector('textarea'),null);assert.equal(document.querySelector('input[type=file]'),null);
  console.log('✅ Atendimento: salvar sem enviar, versão persistida, edição pendente e bloqueio após aprovação OK.');
} finally {await settle(()=>root.unmount());await fs.unlink(outfile);}

