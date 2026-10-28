import {Router,type Request,type Response,type NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import prisma from './db.js';
import type {Prisma} from '@prisma/client';
import {administrator} from './professional-admin.js';
import {objectStorageEnabled,putPrivateObject,retireStoredFile,signedDocumentUrl,hash} from './document-storage.js';
const router=Router();type AuthRequest=Request&{userId?:string};
export const PERSONAL_FILE_LIMIT=25000000;
class StorageError extends Error{constructor(public status:number,message:string){super(message);}}
const fail=(res:Response,error:unknown)=>{if(error instanceof StorageError)return res.status(error.status).json({error:error.message});if((error as any)?.code==='P2002')return res.status(409).json({error:'Já existe uma pasta com esse nome.'});return res.status(503).json({error:'Não foi possível concluir a operação de armazenamento. Tente novamente.'});};
function auth(req:AuthRequest,res:Response,next:NextFunction){try{const value=jwt.verify((req.headers.authorization??'').replace(/^Bearer /,''),process.env.JWT_SECRET??'dev-only-mydoctor-jwt-secret-change-me') as {uid:string};if(!value.uid)throw Error();req.userId=value.uid;next();}catch{res.status(401).json({error:'Entre na sua conta para acessar seus arquivos.'});}}
async function admin(req:AuthRequest,res:Response,next:NextFunction){try{const value=await administrator(req);if(!value.authorized)return res.status(403).json({error:'Acesso restrito à administração.'});req.userId=value.user.id;next();}catch{res.status(401).json({error:'Entre na sua conta.'});}}
const route=(handler:(req:AuthRequest,res:Response)=>Promise<unknown>)=>(req:AuthRequest,res:Response)=>{void handler(req,res).catch(error=>fail(res,error));};
const cleanName=(value:unknown,max=180)=>String(value??'').replace(/[\\/\r\n\x00-\x1f]/g,'_').trim().slice(0,max);
const version=(value:unknown)=>{const date=new Date(String(value??''));if(!Number.isFinite(date.getTime()))throw new StorageError(400,'Atualize a consulta antes de salvar.');return date;};
async function ensureAccount(userId:string){return prisma.storageAccount.upsert({where:{userId},create:{userId},update:{}});}
export async function lockStorageAccount(tx:Prisma.TransactionClient,userId:string){await tx.$queryRaw`SELECT "userId" FROM "StorageAccount" WHERE "userId"=${userId} FOR UPDATE`;return tx.storageAccount.findUniqueOrThrow({where:{userId}});}
export async function reserveStorage(userId:string,sizeBytes:number){
 if(!Number.isInteger(sizeBytes)||sizeBytes<1||sizeBytes>PERSONAL_FILE_LIMIT)throw new StorageError(400,'Envie um arquivo de até 25 MB, com conteúdo.');
 await ensureAccount(userId);
 return prisma.$transaction(async tx=>{
  const account=await lockStorageAccount(tx,userId);if(!account.uploadsEnabled)throw new StorageError(403,'Novos envios estão suspensos. Você pode consultar, baixar e excluir seus arquivos.');
  await tx.storageReservation.deleteMany({where:{accountId:userId,expiresAt:{lte:new Date()}}});
  const reserved=await tx.storageReservation.aggregate({where:{accountId:userId},_sum:{sizeBytes:true},_count:true});
  const count=await tx.storageFile.count({where:{accountId:userId}});
  if(count+reserved._count>=account.maxFiles)throw new StorageError(409,'Limite de arquivos atingido. Libere espaço ou solicite ampliação.');
  if(account.usedBytes+BigInt(reserved._sum.sizeBytes??0)+BigInt(sizeBytes)>account.limitBytes)throw new StorageError(409,'Espaço insuficiente. Exclua arquivos pessoais ou solicite ampliação do plano.');
  return tx.storageReservation.create({data:{accountId:userId,sizeBytes,expiresAt:new Date(Date.now()+20*60000)}});
 });
}
export async function releaseStorageReservation(id:string){await prisma.storageReservation.deleteMany({where:{id}});}
function pageQuery(req:Request){const page=Math.max(1,Math.min(100000,Number(req.query.page)||1)),size=[10,20,50].includes(Number(req.query.size))?Number(req.query.size):10;return {page:Math.floor(page),size};}
const fileSelect={id:true,name:true,notes:true,folderId:true,mimeType:true,sizeBytes:true,createdAt:true,updatedAt:true,folder:{select:{id:true,name:true}}} as const;
router.get('/storage/summary',auth,route(async(req,res)=>{
 const account=await ensureAccount(req.userId!);const [reserved,files,folders,upgrade]=await Promise.all([prisma.storageReservation.aggregate({where:{accountId:req.userId!,expiresAt:{gt:new Date()}},_sum:{sizeBytes:true}}),prisma.storageFile.count({where:{accountId:req.userId!}}),prisma.storageFolder.count({where:{accountId:req.userId!}}),prisma.storageUpgradeRequest.findUnique({where:{accountId:req.userId!}})]);
 res.setHeader('Cache-Control','private, no-store');return res.json({limitBytes:Number(account.limitBytes),usedBytes:Number(account.usedBytes),reservedBytes:reserved._sum.sizeBytes??0,maxFileBytes:PERSONAL_FILE_LIMIT,maxFiles:account.maxFiles,uploadsEnabled:account.uploadsEnabled,files,folders,upgrade:upgrade?{status:upgrade.status,requestedLimitBytes:Number(upgrade.requestedLimitBytes)}:null});
}));
router.get('/storage/folders',auth,route(async(req,res)=>{res.setHeader('Cache-Control','private, no-store');return res.json(await prisma.storageFolder.findMany({where:{accountId:req.userId!},select:{id:true,name:true,updatedAt:true,_count:{select:{files:true}}},orderBy:{name:'asc'}}));}));
router.post('/storage/folders',auth,route(async(req,res)=>{const name=cleanName(req.body.name,80);if(!name)throw new StorageError(400,'Informe o nome da pasta.');await ensureAccount(req.userId!);const result=await prisma.$transaction(async tx=>{await lockStorageAccount(tx,req.userId!);if(await tx.storageFolder.count({where:{accountId:req.userId!}})>=500)throw new StorageError(409,'Limite de 500 pastas atingido.');return tx.storageFolder.create({data:{accountId:req.userId!,name,normalizedName:name.toLocaleLowerCase('pt-BR')},select:{id:true,name:true,updatedAt:true}});});return res.status(201).json(result);}));
router.put('/storage/folders/:id',auth,route(async(req,res)=>{const name=cleanName(req.body.name,80);if(!name)throw new StorageError(400,'Informe o nome da pasta.');const result=await prisma.storageFolder.updateMany({where:{id:req.params.id,accountId:req.userId!,updatedAt:version(req.body.expectedUpdatedAt)},data:{name,normalizedName:name.toLocaleLowerCase('pt-BR')}});if(!result.count)throw new StorageError(409,'Pasta alterada ou indisponível. Atualize a lista.');return res.json({saved:true});}));
router.delete('/storage/folders/:id',auth,route(async(req,res)=>{await ensureAccount(req.userId!);await prisma.$transaction(async tx=>{await lockStorageAccount(tx,req.userId!);const folder=await tx.storageFolder.findFirst({where:{id:req.params.id,accountId:req.userId!}});if(!folder)throw new StorageError(404,'Pasta não encontrada.');if(await tx.storageFile.count({where:{folderId:folder.id}}))throw new StorageError(409,'Esta pasta contém arquivos. Mova ou exclua os arquivos antes de excluir a pasta.');await tx.storageFolder.delete({where:{id:folder.id}});});return res.json({removed:true});}));
router.get('/storage/files',auth,route(async(req,res)=>{
 const {page,size}=pageQuery(req),q=String(req.query.q??'').trim().slice(0,200),folder=String(req.query.folder??'all'),kind=String(req.query.kind??'');
 const where:Prisma.StorageFileWhereInput={accountId:req.userId!,...(folder==='root'?{folderId:null}:folder!=='all'?{folderId:folder}:{}),...(q?{OR:[{name:{contains:q,mode:'insensitive'}},{notes:{contains:q,mode:'insensitive'}}]}:{}),...(kind==='pdf'?{mimeType:'application/pdf'}:kind==='image'?{mimeType:{startsWith:'image/'}}:kind==='other'?{NOT:[{mimeType:'application/pdf'},{mimeType:{startsWith:'image/'}}]}:{})};
 const sort=['name','sizeBytes','createdAt'].includes(String(req.query.sort))?String(req.query.sort):'createdAt',direction=req.query.direction==='asc'?'asc':'desc';
 const [total,overall,items]=await Promise.all([prisma.storageFile.count({where}),prisma.storageFile.count({where:{accountId:req.userId!}}),prisma.storageFile.findMany({where,select:fileSelect,orderBy:[{[sort]:direction},{id:'asc'}],skip:(page-1)*size,take:size})]);
 res.setHeader('Cache-Control','private, no-store');return res.json({items,total,overall,page,size});
}));
// Bound multipart memory use on Business hosting before accepting the request body.
let uploads=0;
function uploadSlot(_req:Request,res:Response,next:NextFunction){if(uploads>=4)return res.status(429).json({error:'Há envios em andamento. Aguarde e tente novamente.'});uploads++;let released=false;const release=()=>{if(!released){released=true;uploads--;}};res.once('finish',release);res.once('close',release);next();}
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:PERSONAL_FILE_LIMIT,files:1,fields:4}}).single('file');
function multipart(req:Request,res:Response,next:NextFunction){upload(req,res,error=>{if(error)return res.status(400).json({error:'Envie um único arquivo de até 25 MB.'});next();});}
function previewType(buffer:Buffer,mime:string){if(mime==='application/pdf'&&buffer.subarray(0,5).toString()==='%PDF-')return mime;if(mime==='image/png'&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return mime;if(mime==='image/jpeg'&&buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return mime;if(mime==='image/webp'&&buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')return mime;return 'application/octet-stream';}
router.post('/storage/files',auth,uploadSlot,multipart,route(async(req,res)=>{
 if(!objectStorageEnabled())throw new StorageError(503,'O armazenamento pessoal ainda não foi ativado pela administração.');
 const file=req.file;if(!file?.buffer?.length)throw new StorageError(400,'Selecione um arquivo com conteúdo.');
 const name=cleanName(file.originalname);if(!name)throw new StorageError(400,'Informe o nome do arquivo.');const notes=String(req.body.notes??'').trim();if(notes.length>2000)throw new StorageError(400,'As observações devem ter até 2.000 caracteres.');
 const folderId=String(req.body.folderId??'')||null;
 if(folderId&&!await prisma.storageFolder.findFirst({where:{id:folderId,accountId:req.userId!},select:{id:true}}))throw new StorageError(404,'Pasta não encontrada nesta conta.');
 const reservation=await reserveStorage(req.userId!,file.buffer.length);let stored:Awaited<ReturnType<typeof putPrivateObject>>|undefined;
 try{
  const mimeType=previewType(file.buffer,file.mimetype);stored=await putPrivateObject(`storage/contas/${req.userId!}/arquivos`,file.buffer,mimeType);
  const result=await prisma.$transaction(async tx=>{
   const account=await lockStorageAccount(tx,req.userId!);const pending=await tx.storageReservation.findFirst({where:{id:reservation.id,accountId:req.userId!,expiresAt:{gt:new Date()}}});
   if(!account.uploadsEnabled||!pending||account.usedBytes+BigInt(file.buffer.length)>account.limitBytes)throw new StorageError(409,'O envio expirou ou o plano mudou. Atualize a lista e tente novamente.');
   if(folderId&&!await tx.storageFolder.findFirst({where:{id:folderId,accountId:req.userId!}}))throw new StorageError(409,'A pasta foi excluída. Escolha outra pasta.');
   const saved=await tx.storageFile.create({data:{id:reservation.id,accountId:req.userId!,folderId,name,notes,mimeType,sizeBytes:file.buffer.length,sha256:hash(file.buffer),objectKey:stored!.objectKey,storageBucket:stored!.storageBucket},select:fileSelect});
   await tx.storageAccount.update({where:{userId:req.userId!},data:{usedBytes:{increment:file.buffer.length}}});await tx.storageReservation.delete({where:{id:reservation.id}});return saved;
  });return res.status(201).json(result);
 }catch(error){if(stored)await retireStoredFile(prisma,stored).catch(()=>console.error('Falha ao registrar limpeza de arquivo pessoal.'));throw error;}
 finally{await releaseStorageReservation(reservation.id).catch(()=>{});}
}));
router.put('/storage/files/:id',auth,route(async(req,res)=>{
 const name=cleanName(req.body.name),notes=String(req.body.notes??'').trim(),folderId=String(req.body.folderId??'')||null;if(!name||notes.length>2000)throw new StorageError(400,'Confira nome e observações do arquivo.');
 await ensureAccount(req.userId!);await prisma.$transaction(async tx=>{await lockStorageAccount(tx,req.userId!);if(folderId&&!await tx.storageFolder.findFirst({where:{id:folderId,accountId:req.userId!}}))throw new StorageError(404,'Pasta não encontrada nesta conta.');const result=await tx.storageFile.updateMany({where:{id:req.params.id,accountId:req.userId!,updatedAt:version(req.body.expectedUpdatedAt)},data:{name,notes,folderId}});if(!result.count)throw new StorageError(409,'O arquivo mudou ou está indisponível. Atualize a lista.');});return res.json({saved:true});
}));
router.delete('/storage/files/:id',auth,route(async(req,res)=>{await ensureAccount(req.userId!);await prisma.$transaction(async tx=>{await lockStorageAccount(tx,req.userId!);const file=await tx.storageFile.findFirst({where:{id:req.params.id,accountId:req.userId!}});if(!file)throw new StorageError(404,'Arquivo não encontrado nesta conta.');await retireStoredFile(tx,{...file,storageProvider:'s3'});await tx.storageFile.delete({where:{id:file.id}});await tx.storageAccount.update({where:{userId:req.userId!},data:{usedBytes:{decrement:file.sizeBytes}}});});return res.json({removed:true});}));
router.get('/storage/files/:id/download',auth,route(async(req,res)=>{
 const file=await prisma.storageFile.findFirst({where:{id:req.params.id,accountId:req.userId!}});if(!file||!file.objectKey.startsWith(`storage/contas/${req.userId!}/`))throw new StorageError(404,'Arquivo não encontrado nesta conta.');
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Referrer-Policy','no-referrer');const attachment=file.mimeType==='application/octet-stream';
 const url=await signedDocumentUrl({...file,storageProvider:'s3'},file.name,file.mimeType,attachment?'attachment':'inline');
 if(String(req.headers.accept??'').includes('application/json'))return res.json({url,expiresIn:120});return res.redirect(303,url);
}));
router.post('/storage/upgrade',auth,route(async(req,res)=>{const gb=Number(req.body.gb);if(![10,25,50,100].includes(gb))throw new StorageError(400,'Escolha 10, 25, 50 ou 100 GB.');await ensureAccount(req.userId!);await prisma.$transaction(async tx=>{const account=await lockStorageAccount(tx,req.userId!);if(BigInt(gb*1e9)<=account.limitBytes)throw new StorageError(400,'Escolha um espaço maior que o plano atual.');await tx.storageUpgradeRequest.upsert({where:{accountId:req.userId!},create:{accountId:req.userId!,requestedLimitBytes:BigInt(gb*1e9)},update:{requestedLimitBytes:BigInt(gb*1e9),status:'pending'}});});return res.json({requested:true});}));
router.get('/admin/storage/requests',admin,route(async(req,res)=>{const {page,size}=pageQuery(req),q=String(req.query.q??'').trim().slice(0,150);const where:Prisma.StorageUpgradeRequestWhereInput={status:'pending',...(q?{account:{user:{OR:[{name:{contains:q,mode:'insensitive'}},{email:{contains:q,mode:'insensitive'}}]}}}:{})};const [total,items]=await Promise.all([prisma.storageUpgradeRequest.count({where}),prisma.storageUpgradeRequest.findMany({where,include:{account:{include:{user:{select:{name:true,email:true}}}}},orderBy:{createdAt:'asc'},skip:(page-1)*size,take:size})]);return res.json({total,page,size,items:items.map(row=>({id:row.accountId,name:row.account.user.name,email:row.account.user.email,usedBytes:Number(row.account.usedBytes),limitBytes:Number(row.account.limitBytes),requestedLimitBytes:Number(row.requestedLimitBytes),updatedAt:row.updatedAt}))});}));
router.post('/admin/storage/requests/:id/decision',admin,route(async(req,res)=>{const decision=String(req.body.decision);if(!['approve','reject'].includes(decision))throw new StorageError(400,'Decisão inválida.');await prisma.$transaction(async tx=>{await lockStorageAccount(tx,req.params.id);const request=await tx.storageUpgradeRequest.findFirst({where:{accountId:req.params.id,status:'pending',updatedAt:version(req.body.expectedUpdatedAt)}});if(!request)throw new StorageError(409,'A solicitação mudou. Atualize a lista.');if(decision==='approve')await tx.storageAccount.update({where:{userId:req.params.id},data:{limitBytes:request.requestedLimitBytes}});await tx.storageUpgradeRequest.update({where:{accountId:req.params.id},data:{status:decision==='approve'?'approved':'rejected'}});});return res.json({saved:true});}));
export default router;
