import prisma from './db.js';
import type {Prisma} from '@prisma/client';
export class StorageError extends Error {constructor(public status:number,message:string){super(message)}}
export const PERSONAL_FILE_LIMIT=25000000;
export const ensureAccount=(userId:string)=>prisma.storageAccount.upsert({where:{userId},create:{userId},update:{}});
export async function lockStorageAccount(tx:Prisma.TransactionClient,userId:string){await tx.$queryRaw`SELECT "userId" FROM "StorageAccount" WHERE "userId"=${userId} FOR UPDATE`;return tx.storageAccount.findUniqueOrThrow({where:{userId}})}
// Charge files to their owning account, never to a clinician or another account's tutor.
// Sizes apply equally to R2, legacy disk and documents still stored in the database.
export async function managedStorageBytes(tx:Prisma.TransactionClient,userId:string):Promise<bigint>{
 const rows=await tx.$queryRaw<{bytes:bigint}[]>`
 SELECT COALESCE(sum(n),0)::bigint AS bytes FROM (
 SELECT "sizeBytes"::bigint n FROM "UserIdentityDocument" WHERE "userId"=${userId}
 UNION ALL SELECT d."sizeBytes" FROM "ProfessionalVerificationDocument" d JOIN "Practitioner" p ON p.id=d."practitionerId" WHERE p."userId"=${userId}
 UNION ALL SELECT d."sizeBytes" FROM "PatientIdentityDocument" d JOIN "Patient" p ON p.id=d."patientId" WHERE p."ownerUserId"=${userId}
 UNION ALL SELECT d."sizeBytes" FROM "ClinicalDocument" d JOIN "Patient" p ON p.id=d."patientId" WHERE p."ownerUserId"=${userId}
 UNION ALL SELECT d."sizeBytes" FROM "TutorDocument" d JOIN "TutorRequest" r ON r.id=d."requestId" WHERE r."requesterUserId"=${userId}
 UNION ALL SELECT octet_length(v #>> '{}')::bigint FROM (
   SELECT "accountData" j FROM "User" WHERE id=${userId}
   UNION ALL SELECT data FROM "Patient" WHERE "ownerUserId"=${userId}
   UNION ALL SELECT e.payload FROM "HealthEvent" e JOIN "Patient" p ON p.id=e."patientId" WHERE p."ownerUserId"=${userId}
   UNION ALL SELECT e.provenance FROM "HealthEvent" e JOIN "Patient" p ON p.id=e."patientId" WHERE p."ownerUserId"=${userId}
 ) docs CROSS JOIN LATERAL jsonb_path_query(docs.j,'strict $.** ? (@.type() == "string")') AS v
 WHERE (v #>> '{}') LIKE 'data:%;base64,%'
 ) sizes`;
 return rows[0]?.bytes??0n;
}
export async function reserveStorage(userId:string,sizeBytes:number,personal=true){
 if(!Number.isInteger(sizeBytes)||sizeBytes<1||sizeBytes>PERSONAL_FILE_LIMIT)throw new StorageError(400,'Envie um arquivo de até 25 MB, com conteúdo.');
 await ensureAccount(userId);
 return prisma.$transaction(async tx=>{
  const account=await lockStorageAccount(tx,userId);if(!account.uploadsEnabled)throw new StorageError(403,'Novos envios estão suspensos. Consulta, download e exclusão permanecem disponíveis.');
  await tx.storageReservation.deleteMany({where:{accountId:userId,expiresAt:{lte:new Date()}}});
  const reserved=await tx.storageReservation.aggregate({where:{accountId:userId},_sum:{sizeBytes:true},_count:true});
  if(personal&&await tx.storageFile.count({where:{accountId:userId}})+reserved._count>=account.maxFiles)throw new StorageError(409,'Limite de arquivos pessoais atingido.');
  if(account.usedBytes+await managedStorageBytes(tx,userId)+BigInt(reserved._sum.sizeBytes??0)+BigInt(sizeBytes)>account.limitBytes)throw new StorageError(409,'Espaço total insuficiente. Documentos MyDoctor e arquivos pessoais compartilham a cota. Libere arquivos pessoais ou contrate mais espaço.');
  return tx.storageReservation.create({data:{accountId:userId,sizeBytes,expiresAt:new Date(Date.now()+20*60000)}});
 });
}
export const releaseStorageReservation=(id:string)=>prisma.storageReservation.deleteMany({where:{id}});
export async function withManagedQuota<T>(userId:string,size:number,action:()=>Promise<T>){const reservation=await reserveStorage(userId,size,false);try{return await action()}finally{await releaseStorageReservation(reservation.id)}}
export async function quotaTransaction<T>(userId:string,action:(tx:Prisma.TransactionClient)=>Promise<T>){
 await ensureAccount(userId);
 return prisma.$transaction(async tx=>{
  const account=await lockStorageAccount(tx,userId),before=await managedStorageBytes(tx,userId);
  const result=await action(tx),after=await managedStorageBytes(tx,userId);
  const pending=await tx.storageReservation.aggregate({where:{accountId:userId,expiresAt:{gt:new Date()}},_sum:{sizeBytes:true}});
  // Always allow reductions and non-file changes, even when an older account is over quota.
  if(after>before&&(!account.uploadsEnabled||account.usedBytes+after+BigInt(pending._sum.sizeBytes??0)>account.limitBytes))throw new StorageError(409,'Espaço total insuficiente para esta imagem. Libere arquivos pessoais ou contrate mais espaço.');
  return result;
 },{timeout:20000});
}
