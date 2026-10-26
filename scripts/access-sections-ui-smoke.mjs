import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom'),React=require('react'),{act}=React;
const {createRoot}=require('react-dom/client');
const dom=new JSDOM('<div id="root"></div>',{url:'https://mydoctor.test'});
for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const outfile='.access-sections-test.cjs';
await build({entryPoints:['src/AccessRequestsPanel.tsx'],outfile,bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom']});
const Panel=require('../'+outfile).default,root=createRoot(document.getElementById('root'));
let row={id:'request1',patientId:'patient1',patientName:'Paciente fictício',requesterName:'Profissional fictício',practitionerName:'Profissional fictício',registrations:[],requestedPermission:'read_write_consultation',requestedScope:[],requestedAt:new Date().toISOString(),status:'pending'},approved=0,updated=0;
const api={listIncomingAccessRequests:async()=>[structuredClone(row)],decideAccessRequest:async(id,decision,note,duration,until,sections)=>{approved++;assert.equal(id,'request1');assert.equal(decision,'approve');assert.deepEqual(sections,['medications']);row={...row,status:'approved',grantedSections:sections,grantValidUntil:until};},updateAccessAuthorization:async(id,sections)=>{updated++;assert.equal(id,'request1');assert.deepEqual(new Set(sections),new Set(['medications','allergies']));row={...row,grantedSections:sections};}};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
const check=text=>[...document.querySelectorAll('label')].find(l=>l.textContent.trim()===text)?.querySelector('input[type=checkbox]');
async function settle(work){await act(async()=>{work?.();await new Promise(r=>setTimeout(r,20));});}
try{
 await settle(()=>root.render(React.createElement(Panel,{api})));
 assert.equal(document.querySelectorAll('fieldset input[type=checkbox]').length,9);
 await settle(()=>check('Permitir todas as seções').click());
 await settle(()=>button('Autorizar acesso').click());assert.equal(approved,0);assert.match(document.body.textContent,/Selecione ao menos uma seção/);
 await settle(()=>check('Medicamentos e agenda').click());
 await settle(()=>button('Autorizar acesso').click());assert.equal(approved,1);
 assert.ok(button('Alterar autorização'));assert.ok(button('Revogar acesso'));
 await settle(()=>button('Alterar autorização').click());
 assert.equal(check('Medicamentos e agenda').checked,true);assert.equal(check('Alergias, intolerâncias e cuidados').checked,false);
 await settle(()=>check('Alergias, intolerâncias e cuidados').click());
 await settle(()=>button('Salvar autorização').click());assert.equal(updated,1);assert.equal(button('Salvar autorização'),undefined);
 await settle(()=>button('Alterar autorização').click());await settle(()=>button('Cancelar').click());assert.equal(updated,1);
 console.log('Access authorization UI: existing screen, section selection, empty validation, update and cancel passed.');
}finally{await settle(()=>root.unmount());await fs.unlink(outfile);}
