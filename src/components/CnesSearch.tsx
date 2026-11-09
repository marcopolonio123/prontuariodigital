import {useEffect,useRef,useState} from 'react';
import type {MyDoctorV1Api,CnesLocationV1} from '../lib/api-v1';
import ReferenceSearch,{type Choice} from './ReferenceSearch';
const ufs='AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
export default function CnesSearch({api,onSelect}:{api:MyDoctorV1Api;onSelect:(record:CnesLocationV1)=>void}){
  const [uf,setUf]=useState(''),[city,setCity]=useState<Choice|null>(null),[query,setQuery]=useState(''),[rows,setRows]=useState<Choice[]>([]),[next,setNext]=useState<number|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController>();
  useEffect(()=>()=>request.current?.abort(),[]);
  const clear=()=>{request.current?.abort();setRows([]);setNext(null);setMessage('');setBusy(false)};
  async function run(offset:number,code?:string){
    const current=new AbortController();request.current?.abort();request.current=current;
    setBusy(true);setMessage('');
    try{
      if(code){const result=await api.lookupCnes(code,current.signal);if(!current.signal.aborted)onSelect(result);return;}
      if(!city)return;
      const result=await api.searchCnesUnits(city.code,query,offset,current.signal);
      if(current.signal.aborted)return;
      setRows(result.items.map(x=>({code:x.code,name:x.name,description:x.street})));setNext(result.nextOffset);
      setMessage(result.items.length?'':result.nextOffset!==null?'Nenhuma unidade neste lote. Veja o próximo lote do município.':'Nenhuma unidade neste último lote.');
    }catch(e){if(!current.signal.aborted)setMessage(e instanceof Error?e.message:'Consulta indisponível.');}
    finally{if(!current.signal.aborted)setBusy(false);}
  }
  return <details className="mt-3 space-y-2"><summary className="cursor-pointer text-sm font-bold">Não sei o CNES: buscar por nome</summary>
    <p className="text-xs text-mute">A base oficial retorna unidades por município em lotes. Selecione o endereço correto antes de salvar.</p>
    <label className="block text-xs font-bold">UF da unidade<select value={uf} onChange={e=>{setUf(e.target.value);setCity(null);clear()}} className="ml-2 rounded-lg border border-line p-2"><option value="">Selecione</option>{ufs.map(x=><option key={x}>{x}</option>)}</select></label>
    {uf&&<ReferenceSearch key={uf} label="Buscar município" lookup={(value,signal)=>api.searchCities(uf,value,signal)} onSelect={x=>{clear();setCity(x)}}/>}
    {city&&<><p className="text-xs">{city.name} / {uf}</p><label className="block text-xs font-bold">Nome do estabelecimento<input value={query} maxLength={100} onChange={e=>{clear();setQuery(e.target.value)}} className="mt-1 w-full rounded-lg border border-line p-2"/></label>
      <div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-line px-3 py-2 text-xs font-bold disabled:opacity-50" disabled={busy||query.trim().length<3} onClick={()=>void run(0)}>Buscar unidades</button>{next!==null&&<button type="button" className="rounded-lg border border-line px-3 py-2 text-xs font-bold" disabled={busy} onClick={()=>void run(next)}>Próximo lote</button>}</div>
      {rows.map(x=><button type="button" className="block w-full rounded-lg border border-line p-2 text-left text-sm" key={x.code} disabled={busy} onClick={()=>void run(0,x.code)}>{x.name}<span className="block text-xs text-mute">CNES {x.code} · {x.description}</span></button>)}
    </>}
    {busy&&<p role="status" className="text-xs">Consultando CNES…</p>}{message&&<p role="status" className="text-xs">{message}</p>}
  </details>;
}
