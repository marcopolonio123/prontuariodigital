import {Router,type Response} from 'express';
import {Prisma} from '@prisma/client';
import prisma from './db.js';
import {requireAdmin,type AdminRequest} from './professional-admin.js';
import {listMedicationReferences,CatalogError} from './medication-catalog.js';
import {listOperatorReferences,normalized,ReferenceError} from './guided-references.js';

const router=Router();
const kinds=['insurers','medications','professionals','facilities'] as const;
type Kind=typeof kinds[number];
const pageSize=10;
const select={id:true,kind:true,name:true,internalCode:true,description:true,active:true,version:true,createdAt:true,updatedAt:true} as const;

class CatalogInputError extends Error {
  constructor(readonly status:number,message:string){super(message);}
}
function kindOf(value:string):Kind{
  if(!kinds.includes(value as Kind))throw new CatalogInputError(404,'Cadastro não encontrado.');
  return value as Kind;
}
function field(value:unknown,max:number,required=false){
  if(value==null&&!required)return '';
  if(typeof value!=='string'||value.length>max)throw new CatalogInputError(400,'Confira o tamanho e o formato dos campos.');
  const result=value.trim();
  if(required&&result.length<2)throw new CatalogInputError(400,'Informe um nome com pelo menos dois caracteres.');
  return result;
}
function changes(body:Record<string,unknown>){
  const name=field(body.name,150,true),internalCode=field(body.internalCode,80)||null,description=field(body.description,1500);
  const key=(value:string)=>normalized(value).replace(/\s+/g,' ');
  return {name,internalCode,description,identityKey:internalCode?'code:'+key(internalCode):'name:'+key(name),searchText:key([name,internalCode,description].join(' '))};
}
function versionOf(value:unknown){
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>2147483646)throw new CatalogInputError(400,'Reabra o registro antes de salvar.');
  return value;
}
const endpoint=(fn:(req:AdminRequest,res:Response)=>Promise<unknown>)=>(req:AdminRequest,res:Response):void=>{
  res.setHeader('Cache-Control','no-store');
  void fn(req,res).catch((error:unknown)=>{
    if(error instanceof CatalogInputError||error instanceof ReferenceError||error instanceof CatalogError){res.status(error.status).json({error:error.message});return;}
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2002'){res.status(409).json({error:'Já existe um registro com este código interno ou nome. Confira também os arquivados.'});return;}
    res.status(503).json({error:'Não foi possível concluir a operação no cadastro. Tente novamente.'});
  });
};

async function references(kind:Kind,q:string,skip:number,sort:Prisma.SortOrder){
  if(kind==='medications')return listMedicationReferences(q,skip,pageSize,sort);
  if(kind==='insurers')return listOperatorReferences(q,skip,pageSize,sort);
  if(kind==='professionals'){
    const where:Prisma.PractitionerWhereInput=q?{OR:[{name:{contains:q,mode:'insensitive'}},{registrations:{some:{registration:{equals:q}}}}]}:{};
    const [total,rows]=await prisma.$transaction([
      prisma.practitioner.count({where}),
      prisma.practitioner.findMany({where,skip,take:pageSize,orderBy:[{name:sort},{id:'asc'}],select:{id:true,name:true,profession:true,verificationStatus:true,registrations:{select:{registration:true,region:true,authority:{select:{code:true}}},take:12}}}),
    ]);
    return {total,items:rows.map(row=>({
      id:row.id,name:row.name,code:row.registrations.map(reg=>[reg.authority.code,reg.registration,reg.region].filter(Boolean).join(' ')).join(' · '),
      description:row.profession,source:'Perfil profissional',profileStatus:row.verificationStatus,
    }))};
  }
  const where:Prisma.OrganizationWhereInput=q?{OR:[{name:{contains:q,mode:'insensitive'}},{identifiers:{some:{system:'CNES',value:q}}}]}:{};
  const [total,rows]=await prisma.$transaction([
    prisma.organization.count({where}),
    prisma.organization.findMany({where,skip,take:pageSize,orderBy:[{name:sort},{id:'asc'}],select:{id:true,name:true,legalName:true,identifiers:{where:{system:'CNES'},select:{value:true,source:true,verifiedAt:true},take:1}}}),
  ]);
  return {total,items:rows.map(row=>{
    const cnes=row.identifiers[0];
    return {id:row.id,name:row.name,code:cnes?.value??'',description:row.legalName??'',source:cnes?.source==='DEMAS_CNES'&&cnes.verifiedAt?'CNES conferido':'Unidade cadastrada',edition:cnes?.verifiedAt?.toISOString().slice(0,10)};
  })};
}

router.get('/admin/catalogs/:kind',requireAdmin,endpoint(async(req,res)=>{
  const kind=kindOf(req.params.kind),q=field(req.query.q,100);
  const sort=req.query.sort??'asc';
  if(sort!=='asc'&&sort!=='desc')throw new CatalogInputError(400,'Ordenação inválida.');
  const source=req.query.source??'local',status=req.query.status??'active',page=Number(req.query.page??1);
  if(!Number.isInteger(page)||page<1||page>3000||!['local','reference'].includes(String(source))||!['active','archived','all'].includes(String(status)))throw new CatalogInputError(400,'Filtros inválidos.');
  const skip=(page-1)*pageSize;
  if(source==='reference')return res.json({...await references(kind,q,skip,sort),page,pageSize});
  const where:Prisma.AdminCatalogEntryWhereInput={kind,...(status==='all'?{}:{active:status==='active'}),...(q?{searchText:{contains:normalized(q).replace(/\s+/g,' ')}}:{})};
  const [total,items]=await prisma.$transaction([
    prisma.adminCatalogEntry.count({where}),
    prisma.adminCatalogEntry.findMany({where,skip,take:pageSize,orderBy:[{name:sort},{id:'asc'}],select}),
  ]);
  return res.json({items,total,page,pageSize});
}));

router.get('/admin/catalogs/:kind/:id',requireAdmin,endpoint(async(req,res)=>{
  const kind=kindOf(req.params.kind);
  const entry=await prisma.adminCatalogEntry.findFirst({where:{id:req.params.id,kind},select:{...select,history:{orderBy:{version:'desc'},take:20,select:{action:true,version:true,actorId:true,createdAt:true}}}});
  if(!entry)throw new CatalogInputError(404,'Registro não encontrado.');
  return res.json(entry);
}));

router.post('/admin/catalogs/:kind',requireAdmin,endpoint(async(req,res)=>{
  const kind=kindOf(req.params.kind),data=changes(req.body??{});
  const item=await prisma.$transaction(async tx=>{
    const created=await tx.adminCatalogEntry.create({data:{kind,...data},select});
    await tx.adminCatalogRevision.create({data:{entryId:created.id,actorId:req.actor!.id,action:'create',version:created.version,snapshot:{name:created.name,internalCode:created.internalCode,description:created.description,active:created.active}}});
    return created;
  });
  return res.status(201).json(item);
}));

async function mutate(req:AdminRequest,res:Response,action:'edit'|'archive'|'restore'){
  const kind=kindOf(req.params.kind),version=versionOf(req.body?.expectedVersion);
  const data=action==='edit'?changes(req.body):{active:action==='restore'};
  const item=await prisma.$transaction(async tx=>{
    const where={id:req.params.id,kind};
    if(!await tx.adminCatalogEntry.findFirst({where,select:{id:true}}))throw new CatalogInputError(404,'Registro não encontrado.');
    const changed=await tx.adminCatalogEntry.updateMany({where:{...where,version,active:action!=='restore'},data:{...data,version:{increment:1}}});
    if(!changed.count)throw new CatalogInputError(409,'O registro mudou ou não está disponível para esta ação. Atualize a consulta.');
    const next=await tx.adminCatalogEntry.findUniqueOrThrow({where:{id:req.params.id},select});
    await tx.adminCatalogRevision.create({data:{entryId:next.id,actorId:req.actor!.id,action,version:next.version,snapshot:{name:next.name,internalCode:next.internalCode,description:next.description,active:next.active}}});
    return next;
  });
  return res.json(item);
}
router.put('/admin/catalogs/:kind/:id',requireAdmin,endpoint((req,res)=>mutate(req,res,'edit')));
router.delete('/admin/catalogs/:kind/:id',requireAdmin,endpoint((req,res)=>mutate(req,res,'archive')));
router.post('/admin/catalogs/:kind/:id/restore',requireAdmin,endpoint((req,res)=>mutate(req,res,'restore')));
export default router;
