import {randomUUID,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadBucketCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import type {Response} from 'express';
import type {Prisma} from '@prisma/client';
import prisma from './db.js';
export type StoredReference={storageProvider?:string|null;storageBucket?:string|null;objectKey?:string|null;content?:Uint8Array|null};
type FileInput={filename:string;mimeType:string;sizeBytes:number;sha256:string;content:Buffer};
export function objectStorageEnabled(){return process.env.DOCUMENT_STORAGE_MODE==='s3';}
function connection(){
 const bucket=process.env.DOCUMENT_STORAGE_BUCKET,region=process.env.DOCUMENT_STORAGE_REGION;
 const accessKeyId=process.env.DOCUMENT_STORAGE_ACCESS_KEY_ID,secretAccessKey=process.env.DOCUMENT_STORAGE_SECRET_ACCESS_KEY;
 const endpoint=process.env.DOCUMENT_STORAGE_ENDPOINT;
 if(!bucket||!region||!accessKeyId||!secretAccessKey)throw Error('Armazenamento privado não configurado.');
 if(endpoint&&new URL(endpoint).protocol!=='https:'&&process.env.NODE_ENV!=='test')throw Error('Armazenamento privado exige HTTPS.');
 return {bucket,client:new S3Client({region,endpoint,forcePathStyle:process.env.DOCUMENT_STORAGE_PATH_STYLE!=='false',credentials:{accessKeyId,secretAccessKey},maxAttempts:2,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',requestHandler:{connectionTimeout:5000,requestTimeout:15000}})};
}
function validKey(key:string){if(!key||key.startsWith('/')||key.includes('\\')||key.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Chave de documento inválida.');return key;}
export const hash=(content:Uint8Array)=>createHash('sha256').update(content).digest('hex');
export async function checkObjectStorage(){const {client,bucket}=connection();try{await client.send(new HeadBucketCommand({Bucket:bucket}));}finally{client.destroy();}}
export async function putPrivateObject(prefix:string,content:Buffer,mimeType:string){
 const {client,bucket}=connection(),key=validKey(prefix+'/'+randomUUID());
 try{await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:content,ContentType:mimeType,ContentLength:content.length,CacheControl:'private, no-store',Metadata:{sha256:hash(content)}}));}
 catch(error){await retireStoredFile(prisma,{storageProvider:'s3',storageBucket:bucket,objectKey:key}).catch(()=>console.error('Falha ao registrar limpeza de envio não confirmado.'));throw error;}
 finally{client.destroy();}
 return {storageProvider:'s3',storageBucket:bucket,objectKey:key};
}
export async function readPrivateObject(ref:StoredReference){
 if(ref.storageProvider!=='s3'||!ref.storageBucket||!ref.objectKey)throw Error('Referência de documento incompleta.');
 const {client}=connection();try{const result=await client.send(new GetObjectCommand({Bucket:ref.storageBucket,Key:validKey(ref.objectKey)}));if(!result.Body)throw Error('Arquivo não encontrado.');return Buffer.from(await result.Body.transformToByteArray());}finally{client.destroy();}
}
export async function signedDocumentUrl(ref:StoredReference,filename:string,mimeType:string){
 if(ref.storageProvider!=='s3'||!ref.storageBucket||!ref.objectKey)throw Error('Referência de documento incompleta.');
 const {client}=connection();try{return await getSignedUrl(client,new GetObjectCommand({Bucket:ref.storageBucket,Key:validKey(ref.objectKey),ResponseContentType:mimeType,ResponseContentDisposition:`inline; filename*=UTF-8''${encodeURIComponent(filename)}`,ResponseCacheControl:'private, no-store'}),{expiresIn:120});}finally{client.destroy();}
}
export async function serveDocument(res:Response,doc:StoredReference&{filename:string;mimeType:string},json=false){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(doc.storageProvider==='s3'){const url=await signedDocumentUrl(doc,doc.filename,doc.mimeType);if(json)res.json({url,expiresIn:120});else res.redirect(303,url);return;}
 if(!doc.content)throw Error('Conteúdo do documento indisponível.');
 res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(doc.filename)}`);res.type(doc.mimeType).send(Buffer.from(doc.content));
}
export async function retireStoredFile(tx:Prisma.TransactionClient,ref:StoredReference|null|undefined){
 if(ref?.storageProvider==='s3'&&ref.objectKey&&ref.storageBucket)await tx.storageDeletion.upsert({where:{bucket_objectKey:{bucket:ref.storageBucket,objectKey:ref.objectKey}},create:{bucket:ref.storageBucket,objectKey:ref.objectKey},update:{}});
}
export async function withStoredFile<T>(file:FileInput,prefix:string,action:(data:Omit<FileInput,'content'>&{content:Uint8Array<ArrayBuffer>|null;storageProvider:string|null;storageBucket:string|null;objectKey:string|null})=>Promise<T>){
 if(!objectStorageEnabled())return action({...file,content:new Uint8Array(file.content),storageProvider:null,storageBucket:null,objectKey:null});
 const ref=await putPrivateObject(prefix,file.content,file.mimeType);
 try{return await action({...file,...ref,content:null});}
 catch(error){await retireStoredFile(prisma,ref).catch(()=>console.error('Falha ao registrar limpeza de upload não confirmado.'));throw error;}
}
export const legacyDocumentRoot=()=>path.resolve(process.env.DOCUMENT_STORAGE_PATH??path.join(process.cwd(),'private-documents'));
export function legacyDocumentPath(key:string){validKey(key);const root=legacyDocumentRoot(),resolved=path.resolve(root,key);if(!resolved.startsWith(root+path.sep))throw Error('Caminho inválido.');return resolved;}
export async function storeClinicalFile(prefix:string,buffer:Buffer,mimeType:string,legacyKey:string){
 if(objectStorageEnabled())return putPrivateObject(prefix,buffer,mimeType);
 if(process.env.NODE_ENV==='production'&&!process.env.DOCUMENT_STORAGE_PATH)throw Error('Diretório privado persistente não configurado.');
 const absolute=legacyDocumentPath(legacyKey);await fs.mkdir(path.dirname(absolute),{recursive:true});await fs.writeFile(absolute,buffer,{flag:'wx'});
 return {storageProvider:'local_private',storageBucket:null,objectKey:legacyKey};
}
let cleaning=false;
export async function cleanupStoredFiles(){
 if(!objectStorageEnabled()||cleaning)return;
 const {client}=connection();cleaning=true;
 try{const jobs=await prisma.storageDeletion.findMany({where:{nextAttemptAt:{lte:new Date()}},orderBy:{nextAttemptAt:'asc'},take:25});
 for(const job of jobs){try{
  // Object keys are immutable and never reused. Retain anything still referenced.
  const linked=await Promise.all([prisma.userIdentityDocument.count({where:{storageBucket:job.bucket,objectKey:job.objectKey}}),prisma.patientIdentityDocument.count({where:{storageBucket:job.bucket,objectKey:job.objectKey}}),prisma.professionalVerificationDocument.count({where:{storageBucket:job.bucket,objectKey:job.objectKey}}),prisma.tutorDocument.count({where:{storageBucket:job.bucket,objectKey:job.objectKey}}),prisma.clinicalDocument.count({where:{objectKey:job.objectKey}})]);
  if(linked.some(Boolean))continue;
  await client.send(new DeleteObjectCommand({Bucket:job.bucket,Key:validKey(job.objectKey)}));await prisma.storageDeletion.deleteMany({where:{id:job.id}});
 }catch{await prisma.storageDeletion.updateMany({where:{id:job.id},data:{attempts:{increment:1},nextAttemptAt:new Date(Date.now()+Math.min(86400000,60000*2**Math.min(job.attempts,10)))}});}
 }}finally{client.destroy();cleaning=false;}
}
