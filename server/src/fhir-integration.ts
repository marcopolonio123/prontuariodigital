import {createHash} from 'node:crypto';
export const categories=['consultation','laboratory','imaging','prescription'] as const;
export type Category=typeof categories[number];
export class IntegrationError extends Error {constructor(public status:number,message:string){super(message)}}
function required(ok:unknown,message:string):asserts ok {if(!ok)throw new IntegrationError(422,message)}
function text(v:unknown,max=5000):string {required(typeof v==='string'&&v.trim().length>0&&v.length<=max,'Texto ausente ou maior que o permitido.');return v.trim()}
const cc=(c:any)=> typeof c?.text==='string'?c.text:(c?.coding??[]).map((x:any)=>x.display??x.code).filter(Boolean).join(', ');
const date=(v:any)=>{required(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),'Informe data/hora FHIR com fuso horário.');return new Date(v).toISOString()};
export function canonical(v:any):string {return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)}
export function parseClinicalBundle(bundle:any,consentId:string){
 required(Buffer.byteLength(JSON.stringify(bundle)??'')<=512*1024,'Bundle limitado a 512 KB. Arquivos devem utilizar o fluxo de documentos, fora do JSON clínico.');
 required(bundle?.resourceType==='Bundle'&&bundle.type==='collection'&&Array.isArray(bundle.entry)&&bundle.entry.length>0&&bundle.entry.length<=50,'Envie um Bundle FHIR R4 collection com até 50 recursos.');
 const resources:any[]=[],refs=new Map<string,any>();
 const allowed=['Encounter','Composition','DiagnosticReport','MedicationRequest','Observation','ImagingStudy','Practitioner','PractitionerRole','Organization','Location','Medication','Condition','Procedure','Endpoint','DocumentReference','Specimen'];
 for(const entry of bundle.entry){
  const r=entry?.resource;required(r&&allowed.includes(r.resourceType),'Tipo de recurso fora do contrato de integração MyDoctor.');
  required(typeof r.id==='string'&&/^[A-Za-z0-9.-]{1,64}$/.test(r.id),'Todo recurso precisa de id FHIR.');
  const key=r.resourceType+'/'+r.id;required(!refs.has(key),'Recurso duplicado no Bundle.');refs.set(key,r);
  if(entry.fullUrl){required(typeof entry.fullUrl==='string'&&/^urn:uuid:[0-9a-f-]{36}$/i.test(entry.fullUrl)&&!refs.has(entry.fullUrl),'fullUrl deve ser urn:uuid único.');refs.set(entry.fullUrl,r)}
  required(!r.contained?.length&&!r.modifierExtension?.length&&!r.implicitRules,'Recursos contidos, modifierExtension e implicitRules exigem adaptação específica.');
  if(['Encounter','Composition','DiagnosticReport','MedicationRequest','Observation','ImagingStudy','Condition','Procedure','DocumentReference','Specimen'].includes(r.resourceType))required(r.subject?.reference==='Patient/'+consentId,'O paciente do recurso não corresponde à autorização.');
  resources.push(r);
 }
 const walk=(v:any,depth=0)=>{required(depth<40,'Estrutura muito profunda.');if(!v||typeof v!=='object')return;for(const [k,x] of Object.entries(v)){
  if(k==='reference'){required(typeof x==='string'&&(x==='Patient/'+consentId||refs.has(x)),'Referência externa ou não resolvida. Envie os recursos referenciados no mesmo Bundle.');}
  if(k==='data')required(false,'Anexos binários/base64 não são aceitos neste endpoint.');
  if(k==='url'||k==='address'){if(typeof x==='string')required(!/^(data|file|javascript):/i.test(x),'Endereço de documento inválido.');}
  if(k==='modifierExtension'||k==='contained')required(!Array.isArray(x)||x.length===0,'Extensão modificadora não suportada.');
  walk(x,depth+1);
 }};walk(bundle);
 const roots=resources.filter(r=>['Encounter','DiagnosticReport','MedicationRequest'].includes(r.resourceType));
 required(roots.length===1,'Envie exatamente um atendimento, laudo ou item de receita por Bundle.');const root=roots[0];
 const identity=root.identifier?.[0];required(identity&&typeof identity.system==='string'&&/^https?:\/\/\S+$|^urn:\S+$/.test(identity.system),'Informe identifier.system da origem.');
 const identifierSystem=text(identity.system,250),externalId=text(identity.value,200),version=text(root.meta?.versionId,64);
 required(/^[A-Za-z0-9.-]+$/.test(version),'meta.versionId inválido.');
 let category:Category,title='',occurredAt='',notes='',exams='',prescriptions='',diagnosis='';
 const resolve=(ref:any)=>refs.get(ref?.reference);
 if(root.resourceType==='Encounter'){
  category='consultation';required(root.status==='finished','Atendimento deve estar finalizado (finished).');required(root.class?.code,'Encounter.class obrigatório.');
  occurredAt=date(root.period?.start);title=cc(root.type?.[0])||'Atendimento importado';
  diagnosis=(root.diagnosis??[]).map((d:any)=>cc(resolve(d.condition)?.code)).filter(Boolean).join('; ');
  notes=(root.reasonCode??[]).map(cc).filter(Boolean).join('; ');
  const compositions=resources.filter(r=>r.resourceType==='Composition');
  const plain=(v:string)=>v.replace(/<[^>]*>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
  for(const composition of compositions){required(composition.status==='final'&&composition.encounter?.reference==='Encounter/'+root.id,'Composition deve estar final e referenciar o atendimento deste Bundle.');required(composition.type&&composition.author?.length,'Composition precisa de tipo e autor.');notes+='\n'+(composition.section??[]).map((s:any)=>[s.title,typeof s.text?.div==='string'?plain(s.text.div):''].filter(Boolean).join(': ')).join('\n');}
 }else if(root.resourceType==='DiagnosticReport'){
  const codes=(root.category??[]).flatMap((c:any)=>c.coding??[]).map((c:any)=>c.system==='http://terminology.hl7.org/CodeSystem/v2-0074'?c.code:null);
  required(codes.includes('LAB')!==codes.includes('RAD'),'DiagnosticReport.category deve informar LAB ou RAD (v2-0074), sem ambiguidade.');
  category=codes.includes('LAB')?'laboratory':'imaging';required(['final','amended','corrected','appended'].includes(root.status),'Laudo precisa estar finalizado.');
  occurredAt=date(root.effectiveDateTime??root.effectivePeriod?.start??root.issued);title=text(cc(root.code),300);notes=typeof root.conclusion==='string'?root.conclusion:'';
  exams=(root.result??[]).map((ref:any)=>{const o=resolve(ref);required(o?.resourceType==='Observation','Resultado deve apontar para Observation.');required(['final','amended','corrected'].includes(o.status),'Observation precisa estar finalizada.');required(cc(o.code),'Observation.code obrigatório.');
   const q=o.valueQuantity;let val=q?`${q.comparator??''}${q.value} ${q.unit??q.code??''}`:o.valueString??cc(o.valueCodeableConcept);
   required(val!==undefined&&val!==''||o.dataAbsentReason,'Observation deve informar valor ou motivo de ausência.');
   const ranges=(o.referenceRange??[]).map((r:any)=>r.text??`${r.low?.value??''}–${r.high?.value??''} ${r.low?.unit??r.high?.unit??''}`).join('; ');
   return `${cc(o.code)}: ${val||cc(o.dataAbsentReason)}${ranges?' (referência: '+ranges+')':''}${o.interpretation?.length?' · '+o.interpretation.map(cc).join(', '):''}`;
  }).join('\n');
  if(category==='imaging')for(const ref of root.imagingStudy??[]){const study=resolve(ref);required(study?.resourceType==='ImagingStudy','imagingStudy deve referenciar ImagingStudy do Bundle.');exams+='\nEstudo de imagem: '+(study.description??study.id)+' · '+(study.identifier??[]).map((i:any)=>i.value).join(', ');}
 }else{
  category='prescription';required(['active','completed','stopped','cancelled'].includes(root.status)&&['order','original-order','filler-order','instance-order'].includes(root.intent),'Receita precisa de status e intent compatíveis com uma prescrição.');
  occurredAt=date(root.authoredOn);const med=root.medicationCodeableConcept??resolve(root.medicationReference)?.code;required(cc(med),'Informe o medicamento.');title='Receita: '+cc(med);
  prescriptions=cc(med)+'\n'+(root.dosageInstruction??[]).map((d:any)=>d.text??canonical(d)).join('\n');notes='Receita importada. Assinatura digital não validada pelo MyDoctor. Não incluída automaticamente na agenda de medicamentos.';
 }
 const performer=resolve(root.requester)??resolve(root.performer?.[0])??resolve(root.participant?.[0]?.individual);
 const practitioner=performer?.resourceType==='PractitionerRole'?resolve(performer.practitioner):performer;
 const name=practitioner?.name?.[0];const practitionerName=name?(name.text??[...(name.given??[]),name.family].filter(Boolean).join(' ')):null;
 const organization=resolve(root.serviceProvider)??(performer?.resourceType==='Organization'?performer:resolve(performer?.organization));
 const sourceStatusLabel:Record<string,string>={active:'Em vigor',completed:'Concluída',stopped:'Interrompida',cancelled:'Cancelada',finished:'Finalizado',final:'Final',amended:'Alterado',corrected:'Corrigido',appended:'Complementado'};
 notes='Situação na origem: '+(sourceStatusLabel[root.status]??root.status)+'.\n'+notes;
 const summary={category,title:title.slice(0,300),occurredAt,sourceStatus:root.status,practitionerName,organizationName:organization?.name??null,payload:{notes,exams,prescriptions,diagnosis,integrationCategory:category}};
 return {category,identifierSystem,externalId,version,digest:createHash('sha256').update(canonical(bundle)).digest('hex'),summary};
}
