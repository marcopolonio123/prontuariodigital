import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
if(process.env.NODE_ENV!=='test')throw Error('Use apenas banco de teste isolado.');
const objects=new Map();let failPut=false;
const mock=createServer(async(req,res)=>{const u=new URL(req.url,'http://fixture'),key=decodeURIComponent(u.pathname);if(!req.headers.authorization&&!u.searchParams.has('X-Amz-Signature')){res.writeHead(403);res.end();return;}if(req.method==='PUT'){if(failPut){res.writeHead(503);res.end('<Error><Code>ServiceUnavailable</Code></Error>');return;}const chunks=[];for await(const c of req)chunks.push(c);objects.set(key,Buffer.concat(chunks));res.setHeader('ETag','"fixture"');res.end();return;}if(req.method==='DELETE'){objects.delete(key);res.writeHead(204);res.end();return;}if(req.method==='GET'&&objects.has(key)){res.end(objects.get(key));return;}res.writeHead(404);res.end();});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));
Object.assign(process.env,{PORT:'8800',DOCUMENT_STORAGE_MODE:'s3',DOCUMENT_STORAGE_BUCKET:'vault-fixtures',DOCUMENT_STORAGE_REGION:'us-east-1',DOCUMENT_STORAGE_ENDPOINT:`http://127.0.0.1:${mock.address().port}`,DOCUMENT_STORAGE_ACCESS_KEY_ID:'fixture-key',DOCUMENT_STORAGE_SECRET_ACCESS_KEY:'fixture-secret'});
await import('../dist/index.js');const {prisma:db}=await import('../dist/db.js');const {reserveStorage,releaseStorageReservation,withManagedQuota,quotaTransaction}=await import('../dist/storage-quota.js');const {cleanupStoredFiles}=await import('../dist/document-storage.js');
const users=[],base='http://127.0.0.1:8800/api/v1';let patient,event,healthDoc;
async function account(){const id=randomUUID(),email=`vault-${id}@mydoctor.test`;await db.user.create({data:{id,email,name:'Vault fixture',passwordHash:'fixture',emailVerifiedAt:new Date()}});users.push(id);return {id,email,token:jwt.sign({uid:id},process.env.JWT_SECRET??'dev-only-mydoctor-jwt-secret-change-me')};}
async function call(route,user,body,method=body?'POST':'GET'){const response=await fetch(base+route,{method,redirect:'manual',headers:{...(user?{Authorization:'Bearer '+user.token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
async function send(user,name='teste.pdf',bytes=Buffer.from('%PDF-fixture'),folderId='',mime='application/pdf'){const form=new FormData();form.append('folderId',folderId);form.append('file',new Blob([bytes],{type:mime}),name);const response=await fetch(base+'/storage/files',{method:'POST',headers:{Authorization:'Bearer '+user.token},body:form});return {status:response.status,body:await response.json()};}
try{
 const a=await account(),b=await account();process.env.MYDOCTOR_ADMIN_EMAILS=a.email;
 assert.equal((await call('/storage/summary')).status,401);let summary=(await call('/storage/summary',a)).body;assert.equal(summary.limitBytes,1000000000);assert.equal(summary.usedBytes,0);
 // Reservation lock enforces the quota even under simultaneous requests.
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:15n}});
 const race=await Promise.allSettled([reserveStorage(a.id,10),reserveStorage(a.id,10)]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);for(const result of race)if(result.status==='fulfilled')await releaseStorageReservation(result.value.id);
 await db.storageReservation.create({data:{accountId:a.id,sizeBytes:100,expiresAt:new Date(0)}});const afterExpiry=await reserveStorage(a.id,5);assert.equal(await db.storageReservation.count({where:{accountId:a.id}}),1);await releaseStorageReservation(afterExpiry.id);
 await assert.rejects(reserveStorage(a.id,25000001));await assert.rejects(reserveStorage(a.id,0));
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:1000000n}});
 assert.equal((await call('/storage/summary',b)).body.uploadsEnabled,true);const free=await reserveStorage(b.id,10);await releaseStorageReservation(free.id);
 const folder=(await call('/storage/folders',a,{name:'Contratos'})).body,foreignFolder=(await call('/storage/folders',b,{name:'Privado B'})).body;
 assert.equal((await call('/storage/folders',a,{name:'contratos'})).status,409);
 const child=(await call('/storage/folders',a,{name:'Exames',parentId:folder.id})).body;assert.equal(child.parentId,folder.id);assert.equal((await call('/storage/folders/'+folder.id,a,{name:folder.name,parentId:child.id,expectedUpdatedAt:folder.updatedAt},'PUT')).status,400);assert.equal((await call('/storage/folders/'+child.id,a,{name:child.name,parentId:foreignFolder.id,expectedUpdatedAt:child.updatedAt},'PUT')).status,404);assert.equal((await call('/storage/folders',a,{name:'exames',parentId:folder.id})).status,409);assert.equal((await call('/storage/folders',a,{name:'Estranha',parentId:foreignFolder.id})).status,404);assert.equal((await call('/storage/folders/'+folder.id,a,undefined,'DELETE')).status,409);assert.equal((await call('/storage/folders/'+child.id,a,undefined,'DELETE')).status,200);

 assert.equal((await send(a,'fora.pdf',Buffer.from('%PDF-fixture'),foreignFolder.id)).status,404);
 let upload=await send(a,'Contrato.pdf',Buffer.from('%PDF-fixture'),folder.id);assert.equal(upload.status,201);let file=upload.body;
 assert(!('objectKey' in file));let stored=await db.storageFile.findUnique({where:{id:file.id}});assert(stored.objectKey.startsWith(`storage/contas/${a.id}/arquivos/`));assert(!stored.objectKey.startsWith('pacientes/'));assert.equal(stored.accountId,a.id);
 assert.equal((await call('/storage/summary',a)).body.usedBytes,stored.sizeBytes);assert.equal((await call('/storage/files',b)).body.total,0);
 assert.equal((await call('/storage/files/'+file.id+'/download',b)).status,404);assert.equal((await call('/storage/files/'+file.id,b,undefined,'DELETE')).status,404);
 assert.equal((await call('/storage/files/'+file.id,b,{...file,folderId:null,name:'Ataque',expectedUpdatedAt:file.updatedAt},'PUT')).status,409);
 assert.equal((await call('/storage/folders/'+folder.id,a,undefined,'DELETE')).status,409);
 // A personal metadata row cannot point to a managed medical path or a foreign folder.
 await assert.rejects(db.storageFile.create({data:{accountId:a.id,name:'Ataque',folderId:foreignFolder.id,sizeBytes:1,mimeType:'application/octet-stream',sha256:'x',objectKey:`storage/contas/${a.id}/foreign`,storageBucket:'vault-fixtures'}}));
 await assert.rejects(db.storageFile.create({data:{accountId:a.id,name:'Mistura',sizeBytes:1,mimeType:'application/pdf',sha256:'x',objectKey:'pacientes/medical/report',storageBucket:'vault-fixtures'}}));
 assert.equal((await call('/storage/files/'+file.id,a,{name:'Contrato revisado.pdf',notes:'documento pessoal',folderId:null,expectedUpdatedAt:file.updatedAt},'PUT')).status,200);
 assert.equal((await call('/storage/files/'+file.id,a,{name:'Versão antiga',notes:'',folderId:null,expectedUpdatedAt:file.updatedAt},'PUT')).status,409);
 assert.equal((await call('/storage/folders/'+folder.id,a,undefined,'DELETE')).status,200);
 const personalUrl=await fetch(base+'/storage/files/'+file.id+'/download',{headers:{Authorization:'Bearer '+a.token,Accept:'application/json'},redirect:'error'});assert.equal(personalUrl.status,200);const link=await personalUrl.json();assert.equal(link.expiresIn,120);assert.equal(await(await fetch(link.url)).text(),'%PDF-fixture');
 const forced=await fetch(base+'/storage/files/'+file.id+'/download?download=1',{headers:{Authorization:'Bearer '+a.token,Accept:'application/json'}});assert(new URL((await forced.json()).url).searchParams.get('response-content-disposition').startsWith('attachment;'));
 // Managed documents contribute to the shared quota but never enter personal lists or deletion routes.
 patient=await db.patient.create({data:{id:randomUUID(),ownerUserId:a.id,name:'Paciente fixture',record:'vault-fixture-'+randomUUID(),data:{relationshipToOwner:'self'}}});event=await db.healthEvent.create({data:{patientId:patient.id,type:'consultation',title:'Fixture',occurredAt:new Date(),payload:{}}});
 const medicalKey=`pacientes/${patient.id}/atendimentos/${event.id}/medical`;objects.set('/vault-fixtures/'+medicalKey,Buffer.from('medical-preserve'));
 healthDoc=await db.clinicalDocument.create({data:{patientId:patient.id,eventId:event.id,type:'report',originalFilename:'medical.pdf',mimeType:'application/pdf',objectKey:medicalKey,sha256:'fixture',sizeBytes:500000,metadata:{storageProvider:'s3',storageBucket:'vault-fixtures'}}});
 assert.equal((await call('/storage/files',a)).body.total,1);assert.equal((await call('/storage/summary',a)).body.usedBytes,stored.sizeBytes+500000);assert.equal((await call('/storage/summary',b)).body.managedBytes,0);assert.equal((await call('/storage/files/'+healthDoc.id,a,undefined,'DELETE')).status,404);assert.equal((await call('/storage/files/'+healthDoc.id+'/download',a)).status,404);
 const before=(await call('/storage/summary',a)).body.usedBytes;await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:BigInt(before+15)}});
 const uploads=await Promise.all([send(a,'Um.txt',Buffer.alloc(10,1),'','text/plain'),send(a,'Dois.txt',Buffer.alloc(10,2),'','text/plain')]);assert.deepEqual(uploads.map(x=>x.status).sort(),[201,409]);assert.equal((await call('/storage/summary',a)).body.usedBytes,before+10);
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:1000000n}});
 failPut=true;const failed=await send(a);assert.equal(failed.status,503);failPut=false;assert.equal((await call('/storage/summary',a)).body.usedBytes,before+10);assert.equal(await db.storageReservation.count({where:{accountId:a.id}}),0);
 const html=await send(a,'pagina.html',Buffer.from('<script>alert(1)</script>'),'','text/html');assert.equal(html.status,201);assert.equal(html.body.mimeType,'application/octet-stream');const download=await fetch(base+'/storage/files/'+html.body.id+'/download',{headers:{Authorization:'Bearer '+a.token,Accept:'application/json'}});const address=new URL((await download.json()).url);assert(address.searchParams.get('response-content-disposition').startsWith('attachment;'));
 // Active personal objects are also protected from the common cleanup worker.
 await db.storageDeletion.create({data:{bucket:'vault-fixtures',objectKey:stored.objectKey}});await cleanupStoredFiles();assert(objects.has('/vault-fixtures/'+stored.objectKey));
 assert.equal((await call('/storage/files/'+file.id,a,undefined,'DELETE')).status,200);await cleanupStoredFiles();assert(!objects.has('/vault-fixtures/'+stored.objectKey));assert(objects.has('/vault-fixtures/'+medicalKey));assert(await db.clinicalDocument.findUnique({where:{id:healthDoc.id}}));
 for(let i=0;i<11;i++)assert.equal((await send(a,'Documento '+String(i).padStart(2,'0')+'.pdf')).status,201);
 const first=(await call('/storage/files?page=1&size=10&sort=name&direction=asc',a)).body,second=(await call('/storage/files?page=2&size=10&sort=name&direction=asc',a)).body;assert.equal(first.items.length,10);assert(second.items.length>0);assert(!first.items.some(x=>second.items.some(y=>y.id===x.id)));assert.equal((await call('/storage/files?q=Documento%2003',a)).body.total,1);
 const counter=(await call('/storage/summary',a)).body;const actual=await db.storageFile.aggregate({where:{accountId:a.id},_sum:{sizeBytes:true}});assert.equal(counter.personalBytes,actual._sum.sizeBytes);assert.equal(counter.usedBytes,counter.personalBytes+counter.managedBytes);assert.equal(counter.managedBytes,500000);
 await db.storageAccount.update({where:{userId:a.id},data:{maxFiles:counter.files}});assert.equal((await send(a)).status,409);await db.storageAccount.update({where:{userId:a.id},data:{maxFiles:10000,uploadsEnabled:false}});assert.equal((await send(a)).status,403);assert.equal((await call('/storage/files',a)).status,200);await db.storageAccount.update({where:{userId:a.id},data:{uploadsEnabled:true}});

 // Unified capacity is enforced across managed uploads and personal files.
 const total=(await call('/storage/summary',a)).body.usedBytes;
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:BigInt(total+15)}});
 const mixed=await Promise.allSettled([reserveStorage(a.id,10),withManagedQuota(a.id,10,async()=>{await new Promise(r=>setTimeout(r,100));return 'managed'})]);assert.equal(mixed.filter(x=>x.status==='fulfilled').length,1);assert.equal(mixed.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);for(const r of mixed)if(r.status==='fulfilled'&&r.value?.id)await releaseStorageReservation(r.value.id);
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:BigInt(total+5)}});
 const managedSend=await call('/account/document',a,{kind:'RG',filename:'identidade.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-fixture').toString('base64')});assert.equal(managedSend.status,409);assert.equal(await db.userIdentityDocument.count({where:{userId:a.id}}),0);
 const image='data:image/jpeg;base64,'+Buffer.alloc(100).toString('base64');
 await assert.rejects(quotaTransaction(a.id,tx=>tx.user.update({where:{id:a.id},data:{accountData:{avatarDataUrl:image}}})),e=>e.status===409);assert.deepEqual((await db.user.findUnique({where:{id:a.id}})).accountData,{});
 assert.equal((await call('/patients/'+patient.id+'/events',a,{type:'insurance',title:'Seguro',payload:{cardFront:image}})).status,409);
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:1000000n}});
 await quotaTransaction(a.id,tx=>tx.user.update({where:{id:a.id},data:{accountData:{avatarDataUrl:image}}}));assert.equal((await call('/storage/summary',a)).body.managedBytes,500000+Buffer.byteLength(image));
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:1n}});await quotaTransaction(a.id,tx=>tx.user.update({where:{id:a.id},data:{accountData:{}}}));assert.equal((await call('/storage/files',a)).status,200);
 await db.storageAccount.update({where:{userId:a.id},data:{limitBytes:1000000000n}});
 // Cart is persisted per login. Neither checkout nor legacy admin approval grants capacity.
 assert.equal((await call('/storage/cart',a,{gb:25},'PUT')).status,400);
 assert.equal((await call('/storage/cart',a,{gb:5},'PUT')).body.gb,5);
 assert.equal((await call('/storage/cart',b)).body,null);
 assert.equal((await call('/storage/cart',a,{gb:10},'PUT')).body.gb,10);
 assert.equal((await call('/storage/cart',a)).body.gb,10);
 assert.equal((await call('/storage/plans',a)).body.checkoutEnabled,false);
 assert.equal((await call('/storage/checkout',a,{status:'paid',gb:10})).status,409);
 assert.equal((await call('/admin/storage/requests/'+a.id+'/decision',a,{decision:'approve'})).status,410);
 assert.equal((await call('/storage/upgrade',a,{gb:10})).status,410);
 assert.equal((await call('/storage/summary',a)).body.limitBytes,1000000000);
 assert.equal((await call('/storage/cart',a,undefined,'DELETE')).status,200);assert.equal((await call('/storage/cart',a)).body,null);
 console.log('Personal storage: strict medical namespace isolation, cross-account denial, atomic concurrent quotas, expiry, folders, metadata editing, safe downloads, failure cleanup, pagination, free tier, unified managed/personal capacity, persistent cart and blocked unpaid upgrades passed.');
}catch(error){console.error(error);throw error;}finally{
 if(healthDoc)await db.clinicalDocument.deleteMany({where:{id:healthDoc.id}});if(event)await db.healthEvent.deleteMany({where:{id:event.id}});if(patient)await db.patient.deleteMany({where:{id:patient.id}});
 await db.storageFile.deleteMany({where:{accountId:{in:users}}});await db.storageFolder.deleteMany({where:{accountId:{in:users}}});await db.storageReservation.deleteMany({where:{accountId:{in:users}}});await db.storageUpgradeRequest.deleteMany({where:{accountId:{in:users}}});await db.storageAccount.deleteMany({where:{userId:{in:users}}});await db.storageDeletion.deleteMany({where:{bucket:'vault-fixtures'}});await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();mock.closeAllConnections();await new Promise(r=>mock.close(r));
}
process.exit(0);

