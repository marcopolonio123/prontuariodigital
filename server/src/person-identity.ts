import {Prisma} from '@prisma/client';
import {normalizeCpf,validCpf,normalizeRg,rgError,BRAZIL_UFS} from './document-validation.js';
export class PersonError extends Error {constructor(public status:number,message:string){super(message)}}
export const normalizedPerson=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
export function identityInput(body:any,full=false){
 const cpf=normalizeCpf(String(body.cpf??'')),name=String(body.name??'').trim(),birthDate=String(body.birthDate??'').trim(),motherName=String(body.motherName??'').trim();
 if(cpf&&!validCpf(cpf))throw new PersonError(400,'CPF inválido. Confira os dígitos verificadores.');
 if(full||!cpf){
  const date=new Date(birthDate+'T00:00:00Z');
  if(name.length<3||name.length>150)throw new PersonError(400,'Informe o nome completo da pessoa.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==birthDate||date>new Date()||date.getUTCFullYear()<1900)throw new PersonError(400,'Informe uma data de nascimento válida.');
  if(!cpf&&motherName.length<3)throw new PersonError(400,'Sem CPF, informe o nome completo da mãe. Se desconhecido, solicite auxílio administrativo.');
 }
 if(motherName.length>150)throw new PersonError(400,'O nome da mãe deve ter até 150 caracteres.');
 return {cpf,name,birthDate,motherName};
}
export function personData(body:any):ReturnType<typeof identityInput>&Record<string,string>{
 const identity=identityInput(body,true),rg=normalizeRg(String(body.rg??'')),rgUf=String(body.rgUf??'').toUpperCase();
 const issue=rgError(rg,rgUf,'RG');if(issue)throw new PersonError(400,issue);
 const limits:Record<string,number>={phone:30,postalCode:9,street:180,number:20,complement:100,neighborhood:100,city:100,state:2,country:80};
 const fields:Record<string,string>={};for(const [key,max]of Object.entries(limits)){fields[key]=String(body[key]??'').trim();if(fields[key].length>max)throw new PersonError(400,'Confira os dados de contato e endereço.');}
 fields.postalCode=fields.postalCode.replace(/\D/g,'');fields.state=fields.state.toUpperCase();
 if(fields.postalCode&&!/^\d{8}$/.test(fields.postalCode)||fields.state&&!BRAZIL_UFS.includes(fields.state))throw new PersonError(400,'Confira o CEP e a UF.');
 if(fields.phone&&!/^\+?[\d\s().-]{8,30}$/.test(fields.phone))throw new PersonError(400,'Informe país, DDD e celular.');
 const sex=String(body.sex??'');if(!['','female','male','other','unknown'].includes(sex))throw new PersonError(400,'Sexo inválido.');
 const avatarDataUrl=String(body.avatarDataUrl??'');if(avatarDataUrl&&(avatarDataUrl.length>256*1024||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatarDataUrl)||!Buffer.from(avatarDataUrl.split(',')[1],'base64').subarray(0,3).equals(Buffer.from([255,216,255]))))throw new PersonError(400,'Foto de perfil inválida.');
 return {...identity,...fields,rg,rgUf,sex,avatarDataUrl};
}
export function identityKeys(input:ReturnType<typeof identityInput>){
 return [input.cpf?'cpf:'+input.cpf:'',input.name&&input.birthDate&&input.motherName?'birth:'+JSON.stringify([normalizedPerson(input.name),input.birthDate,normalizedPerson(input.motherName)]):''].filter(Boolean).sort();
}
const textNormal=(sql:Prisma.Sql)=>Prisma.sql`trim(regexp_replace(translate(lower(${sql}),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'), '[[:space:]]+', ' ', 'g'))`;
export async function findPeople(tx:any,input:ReturnType<typeof identityInput>,approximate=false){
 const cpfExpr=Prisma.sql`regexp_replace(COALESCE(p.data->>'cpf', CASE WHEN p.data->>'relationshipToOwner'='self' THEN u."accountData"->>'cpf' END,''),'[^0-9]','','g')`;
 const name=textNormal(Prisma.sql`p.name`),mother=textNormal(Prisma.sql`COALESCE(p.data->>'motherName',CASE WHEN p.data->>'relationshipToOwner'='self' THEN u."accountData"->>'motherName' END,'')`);
 const birth=Prisma.sql`COALESCE(p.data->>'birthDate',CASE WHEN p.data->>'relationshipToOwner'='self' THEN u."accountData"->>'birthDate' END,'')`;
 let condition:Prisma.Sql;
 if(input.cpf)condition=Prisma.sql`${cpfExpr}=${input.cpf} OR EXISTS(SELECT 1 FROM "PersonIdentity" i WHERE i."patientId"=p.id AND i.key=${'cpf:'+input.cpf})`;
 else {const n=normalizedPerson(input.name),m=normalizedPerson(input.motherName);condition=Prisma.sql`${birth}=${input.birthDate} AND ${mother}=${m} AND ${approximate?Prisma.sql`strpos(${name},${n})>0`:Prisma.sql`${name}=${n}`}`;}
 return tx.$queryRaw(Prisma.sql`SELECT p.id,p.name,p.record,p.archived,p."ownerUserId",p."tutorUserId",p."tutorManaged",p.data,${cpfExpr} AS cpf FROM "Patient" p JOIN "User" u ON u.id=p."ownerUserId" WHERE (${condition}) ORDER BY p.name,p.id LIMIT 21`) as Promise<any[]>;
}
// Locks the global keys before checking both old JSON registrations and the unique registry.
export async function claimPerson(tx:any,patientId:string,input:ReturnType<typeof identityInput>){
 const keys=identityKeys(input);for(const key of keys)await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
 const matches=await findPeople(tx,input);if(matches.some(p=>p.id!==patientId))throw new PersonError(409,'Já existe cadastro com estes dados. Consulte a pessoa e solicite o vínculo; não crie outro prontuário.');
 if(input.cpf&&input.motherName){const fallback=await findPeople(tx,{...input,cpf:''});if(fallback.some(p=>p.id!==patientId))throw new PersonError(409,'Existe um possível cadastro anterior sem CPF. Solicite revisão administrativa antes de continuar.');}
 for(const key of keys){const old=await tx.personIdentity.findUnique({where:{key}});if(old&&old.patientId!==patientId)throw new PersonError(409,'Já existe cadastro com estes dados.');}
 await tx.personIdentity.deleteMany({where:{patientId,key:{notIn:keys}}});
 for(const key of keys)await tx.personIdentity.upsert({where:{key},update:{},create:{key,patientId}});
}
