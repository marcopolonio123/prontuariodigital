import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
if(process.env.NODE_ENV!=='test')throw Error('Banco de teste isolado obrigatório.');
process.env.PORT='8802';await import('../dist/index.js');const {prisma:db}=await import('../dist/db.js');const {buildAlerts}=await import('../dist/alerts.js');
const ids=[],patients=[],professionals=[],base='http://127.0.0.1:8802/api/v1';
async function user(){const id=randomUUID(),email=id+'@agenda.test';await db.user.create({data:{id,email,name:'Pessoa fixture',passwordHash:'fixture',emailVerifiedAt:new Date()}});ids.push(id);return {id,email,token:jwt.sign({uid:id},process.env.JWT_SECRET)}}
async function call(path,u,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(u?{Authorization:'Bearer '+u.token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()}}
try{
 const a=await user(),b=await user();process.env.MYDOCTOR_ADMIN_EMAILS=a.email;
 const patient=await db.patient.create({data:{id:randomUUID(),ownerUserId:a.id,name:'Paciente fixture',data:{relationshipToOwner:'self'},medicationAlertsEnabled:true}});patients.push(patient.id);
 const own=await db.practitioner.create({data:{userId:a.id,name:'Administrador próprio',profession:'Médico',verificationStatus:'pending'}}),other=await db.practitioner.create({data:{userId:b.id,name:'Outro profissional',profession:'Médico',verificationStatus:'pending'}});professionals.push(own.id,other.id);
 const queue=await call('/admin/professionals',a);assert.equal(queue.status,200);assert(!queue.body.some(r=>r.id===own.id));assert(queue.body.some(r=>r.id===other.id));
 const settings=(await call('/alerts/settings',a)).body,regular=(await call('/alerts/settings',b)).body;assert(settings.canReview);assert(!regular.canReview);assert(!('professionalReview' in regular.enabled));assert.equal((await call('/alerts/settings',b,{enabled:{professionalReview:true},leadMinutes:60},'PUT')).status,403);
 assert.equal((await call('/alerts/settings',a,{enabled:{appointments:true},leadMinutes:-1},'PUT')).status,400);
 const now=new Date('2026-10-28T12:00:00Z'),at='2026-10-28T12:30:00Z',query='?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z';
 const path='/patients/'+patient.id+'/agenda';assert.equal((await call(path+query)).status,401);assert.equal((await call(path+query,b)).status,403);assert.equal((await call(path,a,{title:'Consulta',at})).status,201);
 const rows=(await call(path+query,a)).body;assert.equal(rows.length,1);const ap=rows[0];assert.equal((await call(path,b,{...ap,expectedUpdatedAt:ap.updatedAt})).status,403);
 assert.equal((await call(path,a,{...ap,status:'completed',expectedUpdatedAt:ap.updatedAt})).status,200);assert.equal((await call(path,a,{...ap,status:'cancelled',expectedUpdatedAt:ap.updatedAt})).status,409);
 await db.healthEvent.create({data:{patientId:patient.id,type:'consultation',status:'final',title:'Consulta anterior',occurredAt:new Date('2026-09-28'),payload:{followUp:{enabled:true,period:'30',at,alert:true}}}});
 await db.healthEvent.create({data:{patientId:patient.id,type:'consultation',status:'pending_patient_confirmation',title:'Ainda não aprovado',occurredAt:now,payload:{followUp:{enabled:true,at,alert:true}}}});
 const merged=(await call(path+query,a)).body;assert.equal(merged.length,2);assert(merged.some(x=>x.source==='return'));assert(!merged.some(x=>x.title.includes('Ainda não aprovado')));
 await db.medicationSchedule.create({data:{patientId:patient.id,name:'Medicamento fixture',dose:'dose cadastrada',weekdays:[now.getUTCDay()],times:['12:00'],timezone:'UTC',continuousUse:true,startsOn:'2026-10-01',recipientIds:[a.id],alertsEnabled:true}});
 await db.professionalVerificationDecision.create({data:{practitionerId:other.id,actorUserId:a.id,actorName:'Admin',decision:'reject',previousStatus:'pending',status:'rejected',note:'Fixture',registrationSnapshot:{},createdAt:now}});
 let alerts=await buildAlerts(a.id,true,now);assert(alerts.some(x=>x.type==='appointments'));assert(alerts.some(x=>x.type==='medications'));assert(alerts.some(x=>x.type==='professionalReview'&&x.text.includes('Outro profissional')));assert(!alerts.some(x=>x.type==='professionalReview'&&x.text.includes('Administrador próprio')));assert(!((await buildAlerts(b.id,false,now)).some(x=>x.type==='appointments'||x.type==='professionalReview')));assert((await buildAlerts(b.id,false,now)).some(x=>x.type==='professionalDecision'));
 assert.equal((await call('/alerts/settings',a,{enabled:{...settings.enabled,appointments:false,medications:false},leadMinutes:30,expectedUpdatedAt:settings.updatedAt},'PUT')).status,200);
 assert.equal((await call('/alerts/settings',a,{enabled:settings.enabled,leadMinutes:60,expectedUpdatedAt:settings.updatedAt},'PUT')).status,409);
 alerts=await buildAlerts(a.id,true,now);assert(!alerts.some(x=>x.type==='appointments'||x.type==='medications'));assert(alerts.some(x=>x.type==='professionalReview'));
 assert.equal((await call('/alerts/read',b,{id:alerts[0].id})).status,404);
 console.log('Agenda/alertas: isolamento, retornos aprovados, edição concorrente, configuração persistida, papel administrativo, fila sem autoavaliação e medicamentos por destinatário OK.');
}finally{
 await db.patientAppointment.deleteMany({where:{patientId:{in:patients}}});await db.medicationSchedule.deleteMany({where:{patientId:{in:patients}}});await db.healthEvent.deleteMany({where:{patientId:{in:patients}}});await db.patient.deleteMany({where:{id:{in:patients}}});await db.practitioner.deleteMany({where:{id:{in:professionals}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
}
process.exit(0);
