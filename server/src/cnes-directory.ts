import {knownCity,normalized,ReferenceError} from './guided-references.js';
import type { Prisma } from '@prisma/client';

export class CnesError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const unavailable = () => new CnesError(503, 'Não foi possível conferir os dados do CNES. Tente novamente ou informe o local manualmente, sem vínculo oficial.');
const states: Record<string,string> = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};

export async function lookupCnes(code: string, transport = fetch) {
  if (!/^\d{7}$/.test(code)) throw new CnesError(400, 'Informe os sete dígitos do CNES.');
  try {
    const options = () => ({ signal: AbortSignal.timeout(8000), redirect: 'error' as const });
    const response = await transport('https://apidadosabertos.saude.gov.br/cnes/estabelecimentos/'+code,options());
    if (response.status === 404) throw new CnesError(404, 'Estabelecimento não encontrado no CNES.');
    if (!response.ok) throw unavailable();
    const row = await response.json();
    if (String(row?.codigo_cnes ?? '').padStart(7,'0') !== code) throw unavailable();
    if (row.codigo_motivo_desabilitacao_estabelecimento != null && !['','0','00'].includes(String(row.codigo_motivo_desabilitacao_estabelecimento).trim())) throw new CnesError(422, 'O CNES indica que este estabelecimento está desabilitado.');
    const field = (value: unknown, max=150) => typeof value === 'string' ? value.trim().slice(0,max) : '';
    const name = field(row.nome_fantasia) || field(row.nome_razao_social);
    const postalCode = field(row.codigo_cep_estabelecimento).replace(/\D/g,'');
    const street = field(row.endereco_estabelecimento,180);
    const state = states[String(row.codigo_uf)];
    const municipality = String(row.codigo_municipio ?? '');
    if (!name || !street || !state || !/^\d{8}$/.test(postalCode) || !/^\d{6,7}$/.test(municipality)) throw unavailable();
    const cepResponse = await transport('https://viacep.com.br/ws/'+postalCode+'/json/',options());
    if (!cepResponse.ok) throw unavailable();
    const cep = await cepResponse.json();
    const city = field(cep?.localidade);
    if (!city || cep.uf !== state || String(cep.cep ?? '').replace(/\D/g,'') !== postalCode || String(cep.ibge ?? '').slice(0,6) !== municipality.slice(0,6)) throw unavailable();
    return {
      code, name, legalName: field(row.nome_razao_social,180) || null,
      unitType: Number.isInteger(row.codigo_tipo_unidade) ? row.codigo_tipo_unidade : null,
      fullAddress:{ postalCode, street, number:field(row.numero_estabelecimento,20), complement:'', neighborhood:field(row.bairro_estabelecimento,100), city, state, country:'BR' },
    };
  } catch (e) { if(e instanceof CnesError) throw e; throw unavailable(); }
}

export async function linkCnes(tx: Prisma.TransactionClient, record: Awaited<ReturnType<typeof lookupCnes>>) {
  // CNES is the establishment identifier; one company can operate multiple units.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'CNES:'+record.code}))::text AS locked`;
  const identifier = await tx.organizationIdentifier.upsert({
    where:{system_value:{system:'CNES',value:record.code}},
    create:{system:'CNES',value:record.code,source:'DEMAS_CNES',verifiedAt:new Date(),
      organization:{create:{name:record.name,legalName:record.legalName,type:'other'}}},
    update:{source:'DEMAS_CNES',verifiedAt:new Date(),organization:{update:{name:record.name,legalName:record.legalName}}},
    select:{organizationId:true},
  });
  return identifier.organizationId;
}

export async function searchCnesUnits(municipality:unknown,query:unknown,offset:unknown,transport=fetch){
  const city=knownCity(municipality);
  if(typeof query!=='string'||normalized(query).length<3||query.length>100||typeof offset!=='number'||!Number.isInteger(offset)||offset<0||offset>20000||offset%20!==0)throw new ReferenceError(400,'Digite ao menos três caracteres do nome e confira a página.');
  const term=normalized(query);
  const params=new URLSearchParams({codigo_municipio:city.code.slice(0,6),status:'1',limit:'20',offset:String(offset)});
  try{
    const response=await transport('https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?'+params,{signal:AbortSignal.timeout(12000),redirect:'error'});
    if(!response.ok)throw unavailable();
    const {estabelecimentos}=await response.json();
    if(!Array.isArray(estabelecimentos)||estabelecimentos.length>20)throw unavailable();
    const items=estabelecimentos.flatMap(row=>{
      const code=String(row?.codigo_cnes??'').padStart(7,'0');
      const name=typeof row?.nome_fantasia==='string'?row.nome_fantasia.trim():typeof row?.nome_razao_social==='string'?row.nome_razao_social.trim():'';
      if(!/^\d{7}$/.test(code)||code==='0000000'||String(row?.codigo_municipio??'').slice(0,6)!==city.code.slice(0,6)||!normalized(name).includes(term))return [];
      return [{code,name:name.slice(0,150),street:typeof row.endereco_estabelecimento==='string'?row.endereco_estabelecimento.slice(0,180):''}];
    });
    return {items,nextOffset:estabelecimentos.length===20&&offset<20000?offset+20:null};
  }catch{throw unavailable();}
}
