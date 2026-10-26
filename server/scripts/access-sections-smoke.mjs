import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ACCESS_SECTIONS, explicitScope, grantedSections, canReadEvent, scopedRecord, validateSections } from '../dist/access-scope.js';

assert.equal(validateSections([]), null);
assert.equal(validateSections(['record', 'invented']), null);
assert.deepEqual(grantedSections(explicitScope(['record'])), ['record']);
assert.deepEqual(grantedSections({version: 2, sections: []}), []);
assert.deepEqual(grantedSections({version: 99, sections: ['record']}), []);
assert.equal(canReadEvent(explicitScope(['record']), 'family_history'), false);
assert.equal(canReadEvent(explicitScope(['medications']), 'prescription'), true);
assert.equal(canReadEvent(explicitScope(['documents']), 'consultation'), false);
assert.equal(canReadEvent(explicitScope(['record']), 'unknown'), false);
assert.deepEqual(scopedRecord({allergies:['private'],medications:['allowed']},explicitScope(['medications'])), {medications:['allowed']});
assert.ok(grantedSections(['record','documents','vitals','insurance']).includes('diary'), 'Legacy grant compatibility');

// Integration tests run only against the disposable CI database.
if (!process.env.DATABASE_URL || process.env.NODE_ENV !== 'test') {
  console.log('Access sections policy checks passed. API integration requires NODE_ENV=test and a disposable database.');
  process.exit(0);
}
process.env.PORT = '8795';
await import('../dist/index.js');
const {prisma: db} = await import('../dist/db.js');
const uid=randomUUID(), doctorId=randomUUID(), strangerId=randomUUID(), patientId=randomUUID(), practitionerId=randomUUID();
const base='http://127.0.0.1:8795/api/v1';
const token=id=>jwt.sign({uid:id},process.env.JWT_SECRET);
const owner=token(uid),doctor=token(doctorId),stranger=token(strangerId);
async function call(path,auth,body,method=body?'POST':'GET') {
 const r=await fetch(base+path,{method,headers:{authorization:'Bearer '+auth,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();return {status:r.status,body:text?JSON.parse(text):null};
}
try {
 for(const [id,name] of [[uid,'Paciente fictício'],[doctorId,'Profissional fictício'],[strangerId,'Terceiro fictício']]) await db.user.create({data:{id,name,email:id+'@mydoctor.test',passwordHash:'not-a-real-password'}});
 await db.patient.create({data:{id:patientId,name:'Paciente fictício',ownerUserId:uid,data:{relationshipToOwner:'self',allergies:['private allergy'],medications:['private medicine'],cpf:'never expose'}}});
 await db.practitioner.create({data:{id:practitionerId,userId:doctorId,name:'Profissional fictício',profession:'Médico',verificationStatus:'verified'}});
 const eventIds={};for(const type of ['consultation','family_history','wellbeing_diary','vital','insurance','prescription']){
  const e=await db.healthEvent.create({data:{patientId,type,status:'final',title:type,occurredAt:new Date(),payload:type==='insurance'?{provider:'Private',cardFront:'data:image/png;base64,private'}:type==='wellbeing_diary'?{entries:[{at:new Date().toISOString(),text:'private diary'}]}:{text:'private '+type}}});eventIds[type]=e.id;
 }
 const doc=await db.clinicalDocument.create({data:{patientId,eventId:eventIds.consultation,type:'exam',originalFilename:'private.pdf',mimeType:'application/pdf',objectKey:randomUUID(),sha256:'test',sizeBytes:1}});
 const request=await call('/professional/access-requests',doctor,{patientId});assert.equal(request.status,201);
 const id=request.body.id,path='/access-requests/'+id,summary='/professional/patients/'+patientId+'/summary',docpath='/patients/'+patientId+'/events/'+eventIds.consultation+'/documents';
 assert.equal((await call(path+'/decision',owner,{decision:'approve',duration:'indefinite',sections:[]})).status,400);
 assert.equal((await call(path+'/decision',stranger,{decision:'approve',duration:'indefinite',sections:['record']})).status,403);
 assert.equal((await call(path+'/decision',owner,{decision:'approve',duration:'indefinite',sections:['medications']})).status,200);
 let s=await call(summary,doctor);assert.equal(s.status,200);assert.deepEqual(s.body.sections,['medications']);assert.deepEqual(s.body.record.medications,['private medicine']);assert.equal(s.body.record.allergies,undefined);assert.equal(s.body.record.cpf,undefined);assert.deepEqual(s.body.events.map(e=>e.type),['prescription']);
 assert.equal((await call(docpath,doctor)).status,403);
 assert.equal((await call(docpath+'/'+doc.id+'/download',doctor)).status,403,'Direct download bypassed scope');
 assert.equal((await call(path+'/authorization',stranger,{duration:'indefinite',sections:['record']},'PATCH')).status,403);
 assert.equal((await call(path+'/authorization',owner,{duration:'until',validUntil:'2000-01-01T00:00:00Z',sections:['record']},'PATCH')).status,400);
 for(const section of ACCESS_SECTIONS){
  assert.equal((await call(path+'/authorization',owner,{duration:'indefinite',sections:[section]},'PATCH')).status,200);
  s=await call(summary,doctor);assert.deepEqual(s.body.sections,[section]);
  const expected={record:['consultation'],allergies:[],family_history:['family_history'],medications:['prescription'],diary:['wellbeing_diary'],vitals:['vital'],documents:[],insurance:['insurance']}[section];
  assert.deepEqual(s.body.events.map(e=>e.type).sort(),expected.sort(),section+' leaked events');
  assert.equal('allergies' in s.body.record,section==='allergies');assert.equal('medications' in s.body.record,section==='medications');
  assert.ok(s.body.events.every(e=>e.documents.length===0));
  if(section==='insurance')assert.equal(s.body.events[0].payload.cardFront,undefined,'Card image bypassed documents permission');
 }
 assert.equal((await call(path+'/authorization',owner,{duration:'indefinite',sections:['record','documents']},'PATCH')).status,200);
 assert.equal((await call(docpath,doctor)).status,200);
 s=await call(summary,doctor);assert.equal(s.body.events[0].documents[0].id,doc.id);
 assert.equal((await call(path+'/authorization',owner,{duration:'indefinite',sections:['record']},'PATCH')).status,200);
 assert.equal((await call(docpath,doctor)).status,403,'Permission reduction did not take effect');
 const incoming=await call('/access-requests/incoming',owner);assert.deepEqual(incoming.body.find(r=>r.id===id).grantedSections,['record']);
 // The tutor can edit, while the unrelated account still cannot.
 await db.patient.update({where:{id:patientId},data:{tutorUserId:strangerId,tutorManaged:true,data:{relationshipToOwner:'dependent'}}});
 assert.equal((await call(path+'/authorization',owner,{duration:'indefinite',sections:['record']},'PATCH')).status,403);
 assert.equal((await call(path+'/authorization',stranger,{duration:'indefinite',sections:['allergies']},'PATCH')).status,200);
 assert.equal((await call(path+'/revoke',stranger,{})).status,200);
 assert.equal((await call(summary,doctor)).status,403);
 assert.equal((await call(path+'/authorization',stranger,{duration:'indefinite',sections:['record']},'PATCH')).status,409);
 console.log('Access sections API: all 8 sections, direct documents, updates, tutor transfer and revocation passed.');
} catch (error) { console.error(error); process.exitCode=1; } finally {
 await db.patient.deleteMany({where:{id:patientId}});
 await db.practitioner.deleteMany({where:{id:practitionerId}});
 await db.user.deleteMany({where:{id:{in:[uid,doctorId,strangerId]}}});
 await db.$disconnect();process.exit(process.exitCode || 0);
}
