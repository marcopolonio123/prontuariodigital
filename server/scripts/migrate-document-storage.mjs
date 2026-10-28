// Run on the app host, where DATABASE_URL, S3 credentials and legacy files are available.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {prisma} from '../dist/db.js';
import {checkObjectStorage,putPrivateObject,readPrivateObject,hash,retireStoredFile,legacyDocumentPath} from '../dist/document-storage.js';
const apply=process.argv.includes('--apply');
const idIndex=process.argv.indexOf('--only-id');
if(idIndex>=0&&(!process.argv[idIndex+1]||process.argv[idIndex+1].startsWith('--')))throw Error('Informe o ID após --only-id.');
const filter=idIndex>=0?{id:process.argv[idIndex+1]}:{};
const groups=[['userIdentityDocument','userId','usuarios','identificacao'],['patientIdentityDocument','patientId','pacientes','identificacao'],['professionalVerificationDocument','practitionerId','profissionais','validacao'],['tutorDocument','requestId','tutoria','comprovantes']];
try{
 const counts={};for(const [table] of groups)counts[table]=await prisma[table].count({where:{...filter,objectKey:null}});
 counts.clinicalDocument=(await prisma.clinicalDocument.count({where:filter}))-(await prisma.clinicalDocument.count({where:{...filter,metadata:{path:['storageProvider'],equals:'s3'}}}));
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',pending:counts}));
 if(!apply)process.exitCode=0;
 else{
  if(process.env.DOCUMENT_STORAGE_MODE!=='s3')throw Error('Configure DOCUMENT_STORAGE_MODE=s3 antes de migrar.');
  await checkObjectStorage();
  for(const [table,owner,subject,category] of groups){let count=0;let cursor;
   while(true){const doc=await prisma[table].findFirst({where:{AND:[filter,{objectKey:null},...(cursor?[{id:{gt:cursor}}]:[])]},orderBy:{id:'asc'}});if(!doc)break;cursor=doc.id;
    assert(doc.content,'Documento legado sem conteúdo.');const bytes=Buffer.from(doc.content);assert.equal(hash(bytes),doc.sha256,'Hash legado divergente.');assert.equal(bytes.length,doc.sizeBytes,'Tamanho legado divergente.');
    const ref=await putPrivateObject(`${subject}/${doc[owner]}/${category}`,bytes,doc.mimeType);
    try{const verified=await readPrivateObject(ref);assert.equal(hash(verified),doc.sha256,'Cópia divergente; original preservado.');assert.equal(verified.length,doc.sizeBytes);
     const result=await prisma[table].updateMany({where:{id:doc.id,sha256:doc.sha256,objectKey:null},data:{...ref,content:null}});
     if(!result.count)await retireStoredFile(prisma,ref);else count++;
    }catch(error){await retireStoredFile(prisma,ref);throw error;}
   }console.log(JSON.stringify({table,migrated:count}));
  }
  let cursor;let count=0;
  while(true){const docs=await prisma.clinicalDocument.findMany({where:filter,...(cursor?{cursor:{id:cursor},skip:1}:{}),orderBy:{id:'asc'},take:25});if(!docs.length)break;
   for(const doc of docs){cursor=doc.id;if(doc.metadata?.storageProvider==='s3')continue;
    const bytes=await fs.readFile(legacyDocumentPath(doc.objectKey));assert.equal(hash(bytes),doc.sha256,'Hash de anexo clínico divergente.');assert.equal(bytes.length,doc.sizeBytes);
    const ref=await putPrivateObject(`pacientes/${doc.patientId}/atendimentos/${doc.eventId??'avulsos'}`,bytes,doc.mimeType);
    try{const verified=await readPrivateObject(ref);assert.equal(hash(verified),doc.sha256,'Cópia divergente; arquivo local preservado.');assert.equal(verified.length,doc.sizeBytes);
     const result=await prisma.clinicalDocument.updateMany({where:{id:doc.id,objectKey:doc.objectKey},data:{objectKey:ref.objectKey,metadata:{...(doc.metadata??{}),storageProvider:'s3',storageBucket:ref.storageBucket,legacyObjectKey:doc.objectKey}}});
     if(!result.count)await retireStoredFile(prisma,ref);else count++;
    }catch(error){await retireStoredFile(prisma,ref);throw error;}
   }
  }console.log(JSON.stringify({table:'clinicalDocument',migrated:count,legacyFiles:'retained'}));
 }
}catch(error){console.error('Migração interrompida; originais não confirmados foram preservados.',error.message);process.exitCode=1;}finally{await prisma.$disconnect();}
