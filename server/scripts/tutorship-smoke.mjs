import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {setTimeout as delay} from 'node:timers/promises';
import {cleanupTutorshipFixtures} from './tutorship-fixtures.mjs';
process.env.PORT='8795';process.env.MYDOCTOR_ADMIN_EMAILS='';
await import('../dist/index.js');
const {prisma:db}=await import('../dist/db.js');
const accounts=[],base='http://127.0.0.1:8795/api/v1';
const call=async(path,user,body,method=body?'POST':'GET')=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(user?{authorization:'Bearer '+user.token}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={bytes:text.length}}return {status:r.status,body:data}};
async function account(name){const id=randomUUID(),email='tutor-'+id+'@mydoctor.test';await db.user.create({data:{id,name,email,passwordHash:'unused-fixture',emailVerifiedAt:new Date()}});accounts.push(id);return {id,email,token:jwt.sign({uid:id},process.env.JWT_SECRET??'dev-only-mydoctor-jwt-secret-change-me')}}
const identity={name:'Criança Ótima Tutoria CI',birthDate:'2018-06-15',motherName:'Mãe Única Tutoria CI',cpf:''};
const pdf={filename:'comprovante-teste.pdf',mimeType:'application/pdf',data:Buffer.from('%PDF-1.4\nfixture').toString('base64')};
try{
 for(let i=0;i<30;i++){try{if((await fetch('http://127.0.0.1:8795/api/health')).ok)break}catch{}await delay(100)}
 const a=await account('Tutor anterior CI'),b=await account('Novo tutor CI'),c=await account('Outro tutor CI'),admin=await account('Administrador tutoria CI');process.env.MYDOCTOR_ADMIN_EMAILS=admin.email;
 assert.equal((await call('/people/search',null,identity)).status,401);
 assert.equal((await call('/people/search',a,{...identity,motherName:''})).status,400);
 assert.equal((await call('/profiles',a,{...identity,relationship:'child'})).status,400,'Inclusão sem consulta foi permitida');
 const search=await call('/people/search',a,identity);assert.equal(search.status,200);assert.equal(search.body.items.length,0);
 const input={...identity,relationship:'child',creationToken:search.body.creationToken};
 const race=await Promise.all([call('/profiles',a,input),call('/profiles',a,input)]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409],'Inclusão concorrente duplicou pessoa');
 const person=race.find(r=>r.status===201).body,id=person.id;assert.equal(person.isTutor,true);assert.match(person.record,/^[1-9][0-9]{0,8}$/);
 assert.equal((await call('/people/search',b,{record:'PR-NOTFOUND'})).status,400);
 assert.equal((await call('/account',a)).body.userNumber,(await db.user.findUniqueOrThrow({where:{id:a.id}})).userNumber);
 const byRecord=await call('/people/search',b,{record:person.record.toLowerCase()});assert.equal(byRecord.status,200);assert.equal(byRecord.body.items[0].id,id);assert.equal(byRecord.body.creationToken,null);assert.equal(byRecord.body.items[0].motherName,undefined);
 const missingRecord=await call('/people/search',b,{record:'999999999'});assert.equal(missingRecord.body.items.length,0);assert.equal(missingRecord.body.creationToken,null);
 const searchB=await call('/people/search',b,{...identity,name:'criança ótima'});assert.equal(searchB.body.items.length,1);assert.equal(searchB.body.items[0].hasTutor,true);assert.equal(searchB.body.items[0].motherName,undefined);assert.equal(searchB.body.items[0].tutorUserId,undefined);
 assert.equal((await call('/patients/'+id+'/events',b)).status,403);assert.equal((await call('/people/'+id,b)).status,403);
 assert.equal((await call('/people/'+id+'/document',a,{...pdf,kind:'Certidão de nascimento'})).status,200);
 assert.equal((await call('/people/'+id+'/document/download',b)).status,403);
 const event=await call('/patients/'+id+'/events',a,{type:'consultation',title:'Registro preservado',occurredAt:new Date().toISOString(),payload:{notes:'Do dependente'}});assert.equal(event.status,201);
 const requestB=await call('/tutorship/requests',b,{token:searchB.body.items[0].token,kind:'ordinary',relationship:'child',reason:'Transferência combinada'});assert.equal(requestB.status,201);
 assert.equal((await call('/tutorship/requests',b,{token:searchB.body.items[0].token,kind:'ordinary',relationship:'child'})).status,409);
 const searchC=await call('/people/search',c,identity);const requestC=await call('/tutorship/requests',c,{token:searchC.body.items[0].token,kind:'ordinary',relationship:'child'});assert.equal(requestC.status,201);
 assert.equal((await call('/tutorship/requests/'+requestB.body.id+'/decision',b,{decision:'approve'})).status,403);
 assert.equal((await call('/tutorship/requests/'+requestB.body.id+'/decision',c,{decision:'approve'})).status,403);
 const decisions=await Promise.all([call('/tutorship/requests/'+requestB.body.id+'/decision',a,{decision:'approve'}),call('/tutorship/requests/'+requestC.body.id+'/decision',a,{decision:'approve'})]);assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409],'Duas transferências foram confirmadas');
 const p=await db.patient.findUniqueOrThrow({where:{id}}),winner=p.tutorUserId===b.id?b:c,loser=winner===b?c:b;assert.ok([b.id,c.id].includes(p.tutorUserId));assert.equal(String(p.recordNumber),person.record);
 assert.equal((await call('/profiles',a)).body.some(p=>p.id===id),false,'Tutor anterior permaneceu na lista');
 assert.equal((await call('/patients/'+id+'/events',a)).status,403,'Tutor anterior lê prontuário');
 assert.equal((await call('/patients/'+id+'/events',winner)).body.some(e=>e.id===event.body.id),true,'Transferência perdeu o atendimento');
 assert.equal((await call('/patients/'+id+'/events',loser)).status,403);
 assert.equal((await call('/people/'+id,winner,{...identity,name:identity.name+' alterado',cpf:'',birthDate:'1980-01-02'},'PUT')).status,400,'Adulto manteve certidão de nascimento');
 assert.equal((await call('/people/'+id+'/end-tutorship',winner,{confirm:true})).status,200);
 assert.equal((await call('/patients/'+id+'/events',winner)).status,403);
 const orphanSearch=await call('/people/search',a,identity);assert.equal(orphanSearch.body.items.length,1);
 assert.equal((await call('/tutorship/requests',a,{token:orphanSearch.body.items[0].token,kind:'ordinary',relationship:'child'})).status,400,'Órfão sem login recebeu tutor sem análise');
 const administrative=await call('/tutorship/requests',a,{token:orphanSearch.body.items[0].token,kind:'administrative',relationship:'child',reason:'Tutor indisponível; validação de responsabilidade'});assert.equal(administrative.status,201);const reqId=administrative.body.id;
 assert.equal((await call('/tutorship/requests/'+reqId+'/submit',a,{})).status,400);
 let doc;for(const kind of ['Identificação do solicitante','Comprovação de responsabilidade']){const r=await call('/tutorship/requests/'+reqId+'/documents',a,{...pdf,kind});assert.equal(r.status,201);doc=r.body}
 assert.equal((await call('/tutorship/documents/'+doc.id,b)).status,403);
 assert.equal((await call('/admin/tutorship/documents/'+doc.id,b)).status,403);
 assert.equal((await call('/admin/tutorship/documents/'+doc.id,admin)).status,200);
 assert.equal((await call('/tutorship/requests/'+reqId+'/submit',a,{})).status,200);
 assert.equal((await call('/patients/'+id+'/events',a)).status,403,'Anexos liberaram acesso antes da análise');
 assert.equal((await call('/admin/tutorship/requests/'+reqId+'/decision',b,{decision:'approve',checkedDocuments:true})).status,403);
 assert.equal((await call('/admin/tutorship/requests/'+reqId+'/decision',admin,{decision:'approve',checkedDocuments:true,note:'Responsabilidade conferida em documentos teste'})).status,200);
 assert.equal((await call('/patients/'+id+'/events',a)).body.length,1);
 assert.equal((await call('/people/'+id+'/tutorship-history',a)).body.length,4);
 // CPF deduplication spans ordinary account completion and dependent creation.
 const owner=await account('Pessoa com login próprio CI'),selfId=randomUUID();await db.patient.create({data:{id:selfId,name:'Pessoa com login próprio CI',ownerUserId:owner.id,data:{relationshipToOwner:'self',birthDate:'1980-01-01'}}});
 const saved=await call('/account',owner,{name:'Pessoa com login próprio CI',birthDate:'1980-01-01',motherName:'Mãe Pessoa CI',cpf:'11144477735',sex:'',city:'',state:'',phone:'',isHealthProfessional:false},'PUT');assert.equal(saved.status,200,JSON.stringify(saved));
 const cpfSearch=await call('/people/search',a,{cpf:'111.444.777-35'});assert.equal(cpfSearch.body.items[0].id,selfId);assert.equal(cpfSearch.body.creationToken,null);assert.equal(cpfSearch.body.items[0].document,'•••••••7735');
 assert.equal((await call('/account',b,{name:'Cadastro duplicado CI',birthDate:'1980-01-01',cpf:'11144477735',sex:'',city:'',state:'',phone:''},'PUT')).status,409);
 console.log('✅ Tutoria: consulta prévia, cadastro único concorrente, privacidade, documentos, um tutor, transferência atômica, desvínculo, análise administrativa e CPF entre contas OK.');
}finally{await cleanupTutorshipFixtures(db,accounts);await db.user.deleteMany({where:{id:{in:accounts}}});await db.$disconnect()}
process.exit(0);
