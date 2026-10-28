import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const folder=await mkdtemp(path.join(os.tmpdir(),'document-preview-'));
try{
 const file=path.join(folder,'preview.cjs');await build({entryPoints:['src/lib/document-preview.ts'],outfile:file,bundle:true,platform:'node',format:'cjs'});
 const {openPrivateDocument}=createRequire(import.meta.url)(file);
 let opened=false,calls=0,navigated='',body={textContent:''};const tab={opener:{},closed:false,document:{title:'',body},location:{replace:url=>{navigated=url;}}};
 global.window={open:()=>{opened=true;return tab;},setTimeout:()=>0};
 global.fetch=async(url,options)=>{assert(opened,'Tab was opened after the asynchronous request');calls++;assert.equal(url,'https://mydoctor.med.br/api/document');assert.equal(options.headers.Accept,'application/json');assert.equal(options.headers.Authorization,'Bearer test-token');return new Response(JSON.stringify({url:'https://private-bucket.example/file?signature=temporary'}),{headers:{'content-type':'application/json'}});};
 await openPrivateDocument('https://mydoctor.med.br/api/document','test-token');assert.equal(tab.opener,null);assert.equal(calls,1,'Signed S3 URL was fetched by JS');assert(navigated.startsWith('https://private-bucket.example/'));
 global.fetch=async()=>new Response('forbidden',{status:403});await assert.rejects(openPrivateDocument('https://mydoctor.med.br/api/document','test-token'));assert.match(body.textContent,/Não foi possível/);
 global.fetch=async()=>new Response(JSON.stringify({url:'javascript:alert(1)'}),{headers:{'content-type':'application/json'}});await assert.rejects(openPrivateDocument('https://mydoctor.med.br/api/document','test-token'),/inválido/);
 global.fetch=async()=>new Response('%PDF-fixture',{headers:{'content-type':'application/pdf'}});await openPrivateDocument('https://mydoctor.med.br/api/document','test-token');assert(navigated.startsWith('blob:'));
 window.open=()=>null;let fetched=false;global.fetch=async()=>{fetched=true;};await assert.rejects(openPrivateDocument('https://mydoctor.med.br/api/document','test-token'),/nova aba/);assert.equal(fetched,false);
 console.log('Document preview: synchronous tab, authenticated URL negotiation, direct S3 navigation without CORS fetch, legacy blob, denial and unsafe URL rejection passed.');
}finally{await rm(folder,{recursive:true,force:true});}
