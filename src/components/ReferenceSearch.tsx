import {useEffect,useRef,useState} from 'react';

export type Choice={code:string;name:string;description?:string};
export default function ReferenceSearch({label,lookup,onSelect,disabled=false}:{label:string;lookup:(value:string,signal:AbortSignal)=>Promise<Choice[]>;onSelect:(item:Choice)=>void;disabled?:boolean}){
  const [query,setQuery]=useState(''),[rows,setRows]=useState<Choice[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController>();
  useEffect(()=>()=>request.current?.abort(),[]);
  async function search(){
    request.current?.abort();
    const current=new AbortController();request.current=current;
    setBusy(true);setRows([]);setMessage('');
    try{const items=await lookup(query.trim(),current.signal);if(!current.signal.aborted){setRows(items);setMessage(items.length?'':'Nenhum resultado neste filtro.');}}
    catch(e){if(!current.signal.aborted)setMessage(e instanceof Error?e.message:'Consulta indisponível.');}
    finally{if(!current.signal.aborted)setBusy(false);}
  }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1 text-xs font-bold text-mute">{label}<input disabled={disabled} className="mt-1 block w-full min-w-0 rounded-lg border border-line p-2 font-normal" value={query} maxLength={100} onChange={e=>{request.current?.abort();setRows([]);setMessage('');setBusy(false);setQuery(e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!busy&&!disabled&&query.trim().length>=2)void search()}}}/></label>
      <button type="button" disabled={disabled||busy||query.trim().length<2} onClick={()=>void search()} className="rounded-lg border border-line px-3 py-2 text-sm font-bold disabled:opacity-50">{busy?'Buscando…':'Buscar'}</button>
    </div>
    {message&&<p role="status" className="text-xs">{message}</p>}
    {rows.length>0&&<ul className="max-h-48 space-y-1 overflow-auto rounded-lg border border-line p-1">{rows.map(row=><li key={row.code}><button type="button" disabled={disabled} onClick={()=>{onSelect(row);setRows([]);setQuery('')}} className="w-full rounded-md p-2 text-left text-sm hover:bg-paper">{row.name}<span className="block text-xs text-mute">{row.code}{row.description?' · '+row.description:''}</span></button></li>)}</ul>}
  </div>;
}
