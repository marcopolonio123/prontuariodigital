import {useState,type ReactNode} from 'react';

export function pageSlice<T>(items:readonly T[],page:number,size:number){
 const pages=Math.max(1,Math.ceil(items.length/size));
 const current=Math.min(Math.max(1,page),pages);
 return {rows:items.slice((current-1)*size,current*size),current,pages};
}

export default function PaginatedList<T>({items,children,label='Registros',resetKey=''}:{items:readonly T[];children:(rows:T[])=>ReactNode;label?:string;resetKey?:string}){
 const signature=resetKey+'|'+items.map((item:any)=>item.id??item.at??JSON.stringify(item)).join('|');
 const [state,setState]=useState({signature,page:1,size:10});
 const page=state.signature===signature||signature.startsWith(state.signature+'|')?state.page:1;
 const {rows,current,pages}=pageSlice(items,page,state.size);
 const change=(next:number,size=state.size)=>setState({signature,page:next,size});
 const controls=(position:string)=>items.length>0&&<nav aria-label={label+' — paginação '+position} className="col-span-full my-3 flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-mute"><label className="flex items-center gap-2">Por página<select aria-label={label+' por página — '+position} value={state.size} onChange={e=>change(1,Number(e.target.value))} className="w-auto rounded-lg border border-line bg-white px-2 py-1">{[10,20,50].map(size=><option key={size}>{size}</option>)}</select></label><span role="status">{(current-1)*state.size+1}–{Math.min(current*state.size,items.length)} de {items.length}</span><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={current===1} onClick={()=>change(current-1)} className="min-h-10 rounded-lg border border-line bg-white px-3 py-1 disabled:opacity-40">Anterior</button><span>Página {current} de {pages}</span><button type="button" disabled={current===pages} onClick={()=>change(current+1)} className="min-h-10 rounded-lg border border-line bg-white px-3 py-1 disabled:opacity-40">Próxima</button></div></nav>;
 return <>{controls('superior')}{children(rows)}{controls('inferior')}</>;
}
