import {cleanupTutorshipFixtures} from './tutorship-fixtures.mjs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import jwt from 'jsonwebtoken';
if(process.env.NODE_ENV!=='test')throw Error('Use somente banco isolado de teste.');
const objects=new Map();let failPut=false,corrupt=false;
const bucket='private-fixtures';
const s3=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://mock'),key=decodeURIComponent(url.pathname);
 if(!req.headers.authorization&&!url.searchParams.has('X-Amz-Signature')){res.writeHead(403);res.end();return;}
 if(req.method==='HEAD'){res.end();return;}
 if(req.method==='PUT'){if(failPut){res.writeHead(503);res.end('<Error><Code>ServiceUnavailable</Code></Error>');return;}const chunks=[];for await(const chunk of req)chunks.push(chunk);objects.set(key,Buffer.concat(chunks));res.setHeader('ETag','"fixture"');res.end();return;}
 if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);res.end();return;}
 if(req.method==='GET'&&objects.has(key)){res.setHeader('content-type','application/pdf');res.end(corrupt?Buffer.from('corrupt'):objects.get(key));return;}
 res.writeHead(404);res.end('<Error><Code>NoSuchKey</Code></Error>');
}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>s3.listen(0,'127.0.0.1',resolve));
Object.assign(process.env,{PORT:'8799',DOCUMENT_STORAGE_MODE:'s3',DOCUMENT_STORAGE_BUCKET:bucket,DOCUMENT_STORAGE_REGION:'us-east-1',DOCUMENT_STORAGE_ENDPOINT:`http://127.0.0.1:${s3.address().port}`,DOCUMENT_STORAGE_ACCESS_KEY_ID:'fixture-access',DOCUMENT_STORAGE_SECRET_ACCESS_KEY:'fixture-secret'});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mydoctor-files-'));process.env.DOCUMENT_STORAGE_PATH=root;
await import('../dist/index.js');
const {prisma:db}=await import('../dist/db.js');
const {cleanupStoredFiles}=await import('../dist/document-storage.js');
const users=[];const ids=[];
async function account(){const id=randomUUID();await db.user.create({data:{id,name:'Storage test',email:`storage-${id}@mydoctor.test`,passwordHash:'fixture',emailVerifiedAt:new Date()}});users.push(id);return {id,token:jwt.sign({uid:id},process.env.JWT_SECRET??'dev-only-mydoctor-jwt-secret-change-me')};}
async function call(route,user,body,method=body?'POST':'GET'){return fetch('http://127.0.0.1:8799/api/v1'+route,{method,redirect:'manual',headers:{'content-type':'application/json',authorization:'Bearer '+user.token},...(body?{body:JSON.stringify(body)}:{})});}
const bytes=Buffer.from('%PDF-1.4\nPrivate fixture\n%%EOF'),sha256=createHash('sha256').update(bytes).digest('hex');
const input={kind:'CNH',filename:'identidade.pdf',mimeType:'application/pdf',data:bytes.toString('base64'),expectedId:null};
async function migrate(id){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/migrate-document-storage.mjs','--apply','--only-id',id],{env:process.env,cwd:new URL('..',import.meta.url),stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});}
try{
 const owner=await account(),other=await account();
 let response=await call('/account/document',owner,input);assert.equal(response.status,201);let doc=await response.json();
 let row=await db.userIdentityDocument.findUnique({where:{id:doc.id}});assert.equal(row.content,null);assert.equal(row.storageProvider,'s3');assert(row.objectKey.startsWith(`usuarios/${owner.id}/identificacao/`));assert.equal(row.storageBucket,bucket);
 assert(!('objectKey' in doc));assert(!('content' in doc));assert.equal((await call(`/account/documents/${doc.id}/download`,other)).status,404);
 response=await call(`/account/documents/${doc.id}/download`,owner);assert.equal(response.status,303);const url=new URL(response.headers.get('location'));
 const negotiated=await fetch('http://127.0.0.1:8799/api/v1'+`/account/documents/${doc.id}/download`,{redirect:'error',headers:{Authorization:'Bearer '+owner.token,Accept:'application/json'}});assert.equal(negotiated.status,200);const preview=await negotiated.json();assert.equal(preview.expiresIn,120);assert(new URL(preview.url).searchParams.has('X-Amz-Signature'));
 assert.equal(url.searchParams.get('X-Amz-Expires'),'120');assert.equal(await(await fetch(url)).text(),bytes.toString());assert.equal((await fetch(url.origin+url.pathname)).status,403);
 assert.equal((await call('/account/document',owner,input)).status,409);assert((await db.storageDeletion.count())>0);await cleanupStoredFiles();assert(objects.has('/'+bucket+'/'+row.objectKey),'Cleanup removed referenced object');
 const oldKey=row.objectKey;response=await call('/account/document',owner,{...input,expectedId:doc.id});assert.equal(response.status,201);doc=await response.json();await cleanupStoredFiles();assert(!objects.has('/'+bucket+'/'+oldKey));
 failPut=true;assert.equal((await call('/account/document',owner,{...input,expectedId:doc.id})).status,503);failPut=false;assert.equal((await db.userIdentityDocument.findUnique({where:{userId:owner.id}})).id,doc.id,'Storage failure replaced metadata');
 // A failed copy must preserve the original database bytes; retry is resumable.
 const legacy=await db.userIdentityDocument.create({data:{userId:other.id,kind:'RG',filename:'legado.pdf',mimeType:'application/pdf',sizeBytes:bytes.length,sha256,content:new Uint8Array(bytes)}});ids.push(legacy.id);
 assert.equal(await(await call(`/account/documents/${legacy.id}/download`,other)).text(),bytes.toString());
 corrupt=true;let migration=await migrate(legacy.id);assert.equal(migration.code,1,migration.output);assert((await db.userIdentityDocument.findUnique({where:{id:legacy.id}})).content);corrupt=false;
 migration=await migrate(legacy.id);assert.equal(migration.code,0,migration.output);row=await db.userIdentityDocument.findUnique({where:{id:legacy.id}});assert.equal(row.content,null);assert.equal(row.sha256,sha256);
 const count=objects.size;migration=await migrate(legacy.id);assert.equal(migration.code,0,migration.output);assert.equal(objects.size,count,'Repeat migration duplicated objects');
 const patient=await db.patient.create({data:{id:randomUUID(),ownerUserId:owner.id,name:'Paciente fixture',record:'storage-'+randomUUID(),data:{relationshipToOwner:'child'},tutorUserId:owner.id}});
 const depResponse=await call('/people/'+patient.id+'/document',owner,input);assert.equal(depResponse.status,200);assert.equal((await db.patientIdentityDocument.findUnique({where:{patientId:patient.id}})).content,null);assert.equal((await call('/people/'+patient.id+'/document/download',other)).status,403);
 const event=await db.healthEvent.create({data:{patientId:patient.id,type:'consultation',title:'Fixture',occurredAt:new Date(),status:'final',payload:{}}});
 const key=`${patient.id}/${event.id}/fixture.pdf`;await fs.mkdir(path.dirname(path.join(root,key)),{recursive:true});await fs.writeFile(path.join(root,key),bytes);
 const clinical=await db.clinicalDocument.create({data:{patientId:patient.id,eventId:event.id,type:'report',originalFilename:'fixture.pdf',mimeType:'application/pdf',objectKey:key,sha256,sizeBytes:bytes.length,metadata:{storageProvider:'local_private'}}});
 migration=await migrate(clinical.id);assert.equal(migration.code,0,migration.output);const moved=await db.clinicalDocument.findUnique({where:{id:clinical.id}});assert.equal(moved.metadata.storageProvider,'s3');assert.equal((await fs.readFile(path.join(root,key))).toString(),bytes.toString(),'Migration removed local original');
 response=await call(`/patients/${patient.id}/events/${event.id}/documents/${clinical.id}/download`,owner);assert.equal(response.status,303);assert.equal(await(await fetch(response.headers.get('location'))).text(),bytes.toString());
 const clinicalPreview=await fetch(`http://127.0.0.1:8799/api/v1/patients/${patient.id}/events/${event.id}/documents/${clinical.id}/download`,{redirect:'error',headers:{Authorization:'Bearer '+owner.token,Accept:'application/json'}});assert.equal(clinicalPreview.status,200);assert.equal((await clinicalPreview.json()).expiresIn,120);
 await db.clinicalDocument.delete({where:{id:clinical.id}});await db.healthEvent.delete({where:{id:event.id}});await db.patientIdentityDocument.delete({where:{patientId:patient.id}});await db.patient.delete({where:{id:patient.id}});
 console.log('Private object storage: metadata-only rows, authorized expiring URLs, no public read, replacement cleanup, provider failure, legacy fallback, verified resumable migration and patient isolation passed.');
}catch(error){console.error('Object storage test failed:',error);throw error;}finally{await cleanupTutorshipFixtures(db,users);await db.userIdentityDocument.deleteMany({where:{userId:{in:users}}});await db.user.deleteMany({where:{id:{in:users}}});await db.storageDeletion.deleteMany({where:{bucket}});await db.$disconnect();s3.closeAllConnections();await new Promise(r=>s3.close(r));await fs.rm(root,{recursive:true,force:true});}
process.exit(0);
