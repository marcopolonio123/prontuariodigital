import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';

export class ReferenceError extends Error {
  constructor(readonly status:number,message:string){super(message);}
}
export const normalized = (s:string) => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
function readReference<T>(name:string):T {
  try{return JSON.parse(gunzipSync(readFileSync(join(__dirname,'../data',name+'.json.gz')),{maxOutputLength:8*1024*1024}).toString('utf8'));}
  catch {throw new ReferenceError(503,'A base de referência está indisponível. O preenchimento manual continua disponível.');}
}
type Ans = {edition:string;operators:Record<string,[string,string,string]>;plans:Record<string,Record<string,string>>};
let ans:Ans|undefined;
const ansDirectory=()=>ans??=readReference<Ans>('ans-directory');
let cityEntries:Array<{code:string;name:string;uf:string}>|undefined;
const ufs:Record<string,string>={11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};
function cities(){
  return cityEntries??=Object.entries(readReference<Record<string,string>>('ibge-cities')).map(([code,name])=>({code,name,uf:ufs[code.slice(0,2)]}));
}
export function searchCities(uf:unknown,query:unknown){
  if(typeof uf!=='string'||!Object.values(ufs).includes(uf)||typeof query!=='string'||normalized(query).length<2||query.length>80)throw new ReferenceError(400,'Selecione a UF e digite o município.');
  return cities().filter(city=>city.uf===uf&&normalized(city.name).includes(normalized(query))).slice(0,20);
}
export function knownCity(code:unknown){
  if(typeof code!=='string'||!/^\d{7}$/.test(code))throw new ReferenceError(400,'Selecione um município da lista.');
  const city=cities().find(item=>item.code===code);
  if(!city)throw new ReferenceError(400,'Município não reconhecido.');
  return city;
}
export function searchAns(query:unknown,operator?:unknown){
  if(typeof query!=='string'||normalized(query).length<2||query.length>100)throw new ReferenceError(400,'Digite pelo menos dois caracteres para buscar.');
  const data=ansDirectory(),term=normalized(query);
  if(operator!=null){
    if(typeof operator!=='string'||!/^\d{6}$/.test(operator)||!data.operators[operator])throw new ReferenceError(400,'Selecione uma operadora da ANS.');
    return {edition:data.edition,items:Object.entries(data.plans[operator]??{}).filter(([code,name])=>code===term||normalized(name).includes(term)).slice(0,20).map(([code,name])=>({code,name}))};
  }
  return {edition:data.edition,items:Object.entries(data.operators).filter(([code,[name,legal]])=>code===term||normalized(name+' '+legal).includes(term)).slice(0,20).map(([code,[name,legalName,uf]])=>({code,name,legalName,uf}))};
}
export function validatedInsurance(value:unknown){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new ReferenceError(400,'Dados do convênio inválidos.');
  const {operatorAnsCode,planAnsCode,ansEdition:_claimed,...payload}=value as Record<string,unknown>;
  const operator=operatorAnsCode??'', plan=planAnsCode??'';
  if(typeof operator!=='string'||typeof plan!=='string')throw new ReferenceError(400,'Selecione os códigos da ANS.');
  if(!operator&&!plan)return {...payload,operatorAnsCode:null,planAnsCode:null,ansEdition:null};
  if(!/^\d{6}$/.test(operator)||plan&&!/^\d{9}$/.test(plan))throw new ReferenceError(400,'Selecione a operadora e o plano no catálogo.');
  const data=ansDirectory(),record=data.operators[operator], product=plan?data.plans[operator]?.[plan]:undefined;
  if(!record||plan&&!product)throw new ReferenceError(422,'O plano não corresponde à operadora nesta edição da ANS.');
  if(payload.provider!==record[0]||plan&&payload.planName!==product)throw new ReferenceError(422,'O nome foi alterado. Selecione novamente ou informe manualmente.');
  return {...payload,operatorAnsCode:operator,planAnsCode:plan||null,ansEdition:data.edition};
}

/** Admin consultation. Plan associations remain under the ANS catalogue. */
export function listOperatorReferences(query:string,skip:number,take:number){
  const {edition,operators}=ansDirectory();
  const term=normalized(query);
  const matches=Object.entries(operators).filter(([id,[name,legal]])=>id.includes(term)||normalized(name+' '+legal).includes(term));
  return {total:matches.length,items:matches.slice(skip,skip+take).map(([id,[name,legal,uf]])=>({
    id,name,code:id,description:[legal,uf].filter(Boolean).join(' · '),source:'ANS',edition,
  }))};
}
