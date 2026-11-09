import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';

export class CatalogError extends Error {
  constructor(readonly status:number,message:string) { super(message); }
}
const normalize = (s:string) => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim().replace(/\s+/g,' ');
type Item = {registration:string;name:string;ingredient:string};
let catalog: {importedOn:string;items:Map<string, Item & {search:string}>} | undefined;
function load() {
  if(catalog)return catalog;
  try {
    const source = JSON.parse(gunzipSync(readFileSync(join(__dirname,'../data/anvisa-medications.json.gz')),{maxOutputLength:8*1024*1024}).toString('utf8'));
    if(!/^\d{4}-\d\d-\d\d$/.test(source.importedOn)||!Array.isArray(source.items)||source.items.length>50000)throw Error();
    const items = new Map<string,Item & {search:string}>();
    for(const [registration,name,ingredient] of source.items) {
      if(!/^\d{9}$/.test(registration)||typeof name!=='string'||!name||name.length>150||typeof ingredient!=='string'||items.has(registration))throw Error();
      items.set(registration,{registration,name,ingredient,search:normalize(name+' '+ingredient)});
    }
    return catalog={importedOn:source.importedOn,items};
  } catch { throw new CatalogError(503,'O catálogo de medicamentos está indisponível. Você pode preencher a agenda manualmente.'); }
}

export function searchMedicationCatalog(query: unknown) {
  if(typeof query!=='string'||query.length>80||normalize(query).length<3)throw new CatalogError(400,'Digite pelo menos três caracteres para buscar.');
  const {items,importedOn}=load();
  const term=normalize(query),words=term.split(' ');
  const matches:Item[]=[];
  const selected=items.get(term);
  if(selected)return {importedOn,items:[{registration:selected.registration,name:selected.name,ingredient:selected.ingredient}]};
  for(const item of items.values())if(words.every(word=>item.search.includes(word)))matches.push({registration:item.registration,name:item.name,ingredient:item.ingredient});
  matches.sort((a,b)=>Number(normalize(b.name).startsWith(term))-Number(normalize(a.name).startsWith(term))||a.name.localeCompare(b.name,'pt-BR')||a.registration.localeCompare(b.registration));
  return {importedOn,items:matches.slice(0,15)};
}
export function verifiedMedication(registration:unknown) {
  if(typeof registration!=='string'||!/^\d{9}$/.test(registration))throw new CatalogError(400,'Selecione um medicamento do catálogo ou preencha o nome manualmente.');
  const item=load().items.get(registration);
  if(!item)throw new CatalogError(422,'O registro não está nesta edição do catálogo. Selecione novamente ou informe o medicamento manualmente.');
  return {name:item.name,medicationRegistration:item.registration};
}
