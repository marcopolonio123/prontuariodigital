import {useEffect,useRef,useState} from 'react';
import type {MyDoctorV1Api} from '../lib/api-v1';
export default function PractitionerLookup({api,council,registration,region,automatic=true,onMatch,onReset,onLocations}:{api:MyDoctorV1Api;council:string;registration:string;region:string;automatic?:boolean;onMatch:(name:string,specialty:string,locations:Array<{id:string;name:string;address:string}>)=>void;onReset?:()=>void;onLocations?:(locations:Array<{id:string;name:string;address:string}>)=>void}){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const version=useRef(0),handler=useRef(onMatch);handler.current=onMatch;const reset=useRef(onReset);reset.current=onReset;const placesHandler=useRef(onLocations);placesHandler.current=onLocations;
 const valid=!!registration.trim()&&region.length===2;
 const lookup=async(preserveIdentity=false)=>{
  const request=++version.current;setBusy(true);setMessage('');
  try{const found=await api.lookupPractitioner(council==='Outros'?'OUTROS':council,registration.trim(),region);
   if(request!==version.current)return;
   if(found){let locations:Array<{id:string;name:string;address:string}>=[];try{locations=await api.listPractitionerLocations(found.id)}catch{}if(request!==version.current)return;if(preserveIdentity){placesHandler.current?.(locations);setMessage(locations.length?'Locais cadastrados do profissional carregados.':'Este profissional não possui locais ativos cadastrados. Use Outros para informar o local.');return;}handler.current(found.name,found.specialty??'',locations);setMessage('Profissional localizado: '+found.name+(found.specialty?' · '+found.specialty:'')+'. Nome e especialidade preenchidos. Confira os dados.')}
   else setMessage('Nenhum profissional validado encontrado com este conselho, registro e UF. Você pode preencher os dados manualmente.');
  }catch(error){if(request===version.current)setMessage(error instanceof Error?error.message:'Não foi possível localizar o profissional.')}
  finally{if(request===version.current)setBusy(false)}
 };
 useEffect(()=>{version.current++;reset.current?.();setBusy(false);setMessage('');if(!valid)return;const timer=setTimeout(()=>void lookup(!automatic),500);return()=>{clearTimeout(timer);version.current++}},[api,council,registration,region,automatic]);
 return <div className="min-w-0 sm:col-span-2"><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!valid||busy} onClick={()=>void lookup()} className="rounded-lg border border-moss-500 px-3 py-2 text-xs font-bold text-moss-800 disabled:opacity-50">{busy?'Localizando profissional...':'Localizar profissional cadastrado'}</button><span className="text-xs text-mute">Conselho + número do registro + UF. Em novos atendimentos, a busca é automática.</span></div>{message&&<p role="status" className="mt-2 text-xs text-mute">{message}</p>}</div>;
}
