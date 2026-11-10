import {useEffect,useState} from 'react';
import type {AdminCatalogEntryV1,AdminCatalogInput,AdminCatalogKind,AdminCatalogPageV1,MyDoctorV1Api} from '../lib/api-v1';

const descriptions:Record<AdminCatalogKind,string>={
  insurers:'Consulte as operadoras da edição da ANS e mantenha os registros locais da ferramenta.',
  medications:'Consulte os registros de produto da edição da Anvisa e mantenha o cadastro local de medicamentos.',
  professionals:'Consulte os perfis existentes e mantenha registros locais. A habilitação e o RQE são tratados em Validação de profissionais.',
  facilities:'Consulte as unidades já vinculadas ao MyDoctor e mantenha registros locais de hospitais, clínicas, laboratórios e outros estabelecimentos.',
};
const button='min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const primary=button+' !bg-pine-900 text-white';
const field='mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink';
const empty=():AdminCatalogInput=>({name:'',internalCode:'',description:''});
const actions:Record<string,string>={create:'Inclusão',edit:'Edição',archive:'Arquivamento',restore:'Reativação'};
const profileStatus:Record<string,string>={verified:'Aprovado',pending:'Em análise',unverified:'Não verificado',rejected:'Recusado',suspended:'Suspenso'};

export default function AdminCatalogPanel({api,kind}:{api:MyDoctorV1Api;kind:AdminCatalogKind}){
  const [sort,setSort]=useState<'asc'|'desc'>('asc');
  const [source,setSource]=useState<'local'|'reference'>('local'),[status,setStatus]=useState('active');
  const [query,setQuery]=useState(''),[applied,setApplied]=useState(''),[page,setPage]=useState(1),[refresh,setRefresh]=useState(0);
  const [data,setData]=useState<AdminCatalogPageV1|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [entry,setEntry]=useState<AdminCatalogEntryV1|null>(null),[form,setForm]=useState<AdminCatalogInput|null>(null);
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[archive,setArchive]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setData(null);
    void api.listAdminCatalog(kind,{source,status,q:applied,page,sort},controller.signal).then(value=>{
      if(controller.signal.aborted)return;
      const last=Math.max(1,Math.ceil(value.total/value.pageSize));
      if(page>last){setPage(last);return;}
      setData(value);
    }).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Consulta indisponível.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[api,kind,source,status,applied,page,sort,refresh]);
  const close=()=>{setForm(null);setEntry(null);setArchive(false)};
  const resetMessages=()=>{setError('');setMessage('')};
  async function run(work:()=>Promise<void>){
    if(busy)return;
    resetMessages();setBusy(true);
    try{await work()}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.')}
    finally{setBusy(false);}
  }
  function afterSave(text:string){
    close();setMessage(text);setPage(1);setRefresh(x=>x+1);
  }
  const pages=Math.max(1,Math.ceil((data?.total??0)/(data?.pageSize??10)));
  const pagination=(label:string)=>pages>1&&<nav aria-label={label} className="flex flex-wrap items-center justify-between gap-2 text-sm">
    <span>Página {page} de {pages}</span>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={page<=1||busy} onClick={()=>setPage(1)}>Primeira</button>
      <button type="button" className={button} disabled={page<=1||busy} onClick={()=>setPage(x=>x-1)}>Anterior</button>
      <button type="button" className={button} disabled={page>=pages||busy} onClick={()=>setPage(x=>x+1)}>Próxima</button>
      <button type="button" className={button} disabled={page>=pages||busy} onClick={()=>setPage(pages)}>Última</button>
    </div>
  </nav>;
  return <div className="mt-4 space-y-4">
    <p className="text-sm text-mute">{descriptions[kind]}</p>
    <div className="flex flex-wrap gap-2">
      {(['local','reference'] as const).map(value=><button key={value} type="button" disabled={busy} aria-pressed={source===value} className={source===value?primary:button} onClick={()=>{if(source===value)return;close();resetMessages();setSource(value);setPage(1)}}>{value==='local'?'Cadastros locais':'Consultar referências'}</button>)}
      {source==='local'&&<button type="button" disabled={busy} className={button} onClick={()=>{close();resetMessages();setForm(empty())}}>+ Incluir cadastro</button>}
    </div>
    {source==='reference'&&<p className="rounded-lg bg-paper p-3 text-xs text-mute">Referências para consulta. As alterações feitas nos cadastros locais não modificam estas fontes.</p>}
    <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();resetMessages();setPage(1);setApplied(query.trim());setRefresh(x=>x+1)}}>
      <label className="min-w-0 flex-1 text-xs font-bold">Buscar por nome ou código<input value={query} maxLength={100} onChange={e=>setQuery(e.target.value)} className={field}/></label>
      {source==='local'&&<label className="text-xs font-bold">Situação<select value={status} className={field} onChange={e=>{resetMessages();setStatus(e.target.value);setPage(1)}}><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option></select></label>}
      <button className={button} disabled={busy}>Buscar</button><button type="button" className={button} disabled={busy} onClick={()=>{resetMessages();setQuery('');setApplied('');setStatus('active');setPage(1);setRefresh(x=>x+1)}}>Limpar</button>
    </form>
    {error&&<p role="alert" className="rounded-lg border border-line p-3 text-sm">{error}</p>}
    {message&&<p role="status" className="rounded-lg bg-moss-50 p-3 text-sm">{message}</p>}
    {loading&&<p role="status" className="text-sm">Carregando cadastros…</p>}
    {data&&<><p role="status" className="text-xs text-mute">{data.total?('Exibindo '+((page-1)*data.pageSize+1)+'–'+Math.min(page*data.pageSize,data.total)+' de '+data.total+' registros'):'0 registros'}</p>
      {pagination('Paginação acima da tabela')}
      {data.items.length>0?<div className="overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm">
        <thead><tr className="border-b border-line"><th className="p-2" scope="col" aria-sort={sort==='asc'?'ascending':'descending'}><button type="button" disabled={busy} className="min-h-10 text-left font-bold underline underline-offset-2" aria-label={sort==='asc'?'Ordenar nome de Z a A':'Ordenar nome de A a Z'} onClick={()=>{resetMessages();setSort(sort==='asc'?'desc':'asc');setPage(1)}}>Nome <span aria-hidden="true">{sort==='asc'?'↑':'↓'}</span></button></th><th className="p-2">Código</th><th className="p-2">Situação / origem</th><th className="p-2">Ações</th></tr></thead>
        <tbody>{data.items.map(item=><tr key={item.id} className="border-b border-line"><th scope="row" className="p-2 font-semibold">{item.name}{item.description&&<span className="block max-w-md break-words text-xs font-normal text-mute">{item.description}</span>}</th>
          {'version' in item?<><td className="break-all p-2">{item.internalCode||'—'}</td><td className="p-2">{item.active?'Ativo':'Arquivado'}</td><td className="p-2"><button type="button" disabled={busy} className={button} onClick={()=>void run(async()=>{const detail=await api.adminCatalogDetail(kind,item.id);setEntry(detail);setArchive(false);setForm(detail.active?{name:detail.name,internalCode:detail.internalCode??'',description:detail.description}:null)})}>Abrir cadastro</button></td></>:<><td className="break-all p-2">{item.code||'—'}</td><td className="p-2">{item.source}{item.profileStatus?' · '+(profileStatus[item.profileStatus]??item.profileStatus):''}{item.edition&&<span className="block text-xs text-mute">{item.edition.split('-').reverse().join('/')}</span>}</td><td className="p-2"><button type="button" className={button} disabled={busy} onClick={()=>{close();resetMessages();setSource('local');setPage(1);setForm({name:item.name.slice(0,150),internalCode:'',description:item.description.slice(0,1500)});setMessage('Confira os dados antes de incluir. Este será um cadastro local.')}}>Usar como base</button></td></>}
        </tr>)}</tbody>
      </table></div>:<p className="text-sm text-mute">Nenhum registro encontrado neste filtro.</p>}
      {pagination('Paginação abaixo da tabela')}
    </>}
    {(form||entry)&&<section className="space-y-3 rounded-xl border border-line bg-paper p-3" aria-label={entry?'Detalhes do cadastro':'Novo cadastro local'}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">{entry?entry.name:'Novo cadastro local'}</h4><button type="button" className={button} disabled={busy} onClick={close}>Fechar</button></div>
      {form&&<form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();void run(async()=>{await api.saveAdminCatalog(kind,form,entry??undefined);afterSave(entry?'Cadastro atualizado.':'Cadastro incluído.')})}}>
        <label className="text-xs font-bold">Nome<input className={field} required minLength={2} maxLength={150} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
        <label className="text-xs font-bold">Código interno (opcional)<input className={field} maxLength={80} value={form.internalCode} onChange={e=>setForm({...form,internalCode:e.target.value})}/></label>
        <label className="text-xs font-bold sm:col-span-2">Descrição<textarea className={field} maxLength={1500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><button className={primary} disabled={busy}>Salvar cadastro</button>{entry&&<button type="button" className={button} disabled={busy} onClick={()=>setArchive(true)}>Arquivar cadastro</button>}</div>
      </form>}
      {entry&&!entry.active&&<><p className="text-sm">Arquivado · {entry.internalCode||'Sem código interno'}</p><p className="whitespace-pre-wrap break-words text-sm">{entry.description}</p><button type="button" className={button} disabled={busy} onClick={()=>void run(async()=>{await api.changeAdminCatalogStatus(kind,entry);afterSave('Cadastro reativado.')})}>Reativar cadastro</button></>}
      {entry?.active&&archive&&<div className="space-y-2 rounded-lg border border-line bg-white p-3"><p className="text-sm">Arquivar {entry.name}? O histórico fica disponível para consulta.</p><div className="flex gap-2"><button type="button" className={primary} disabled={busy} onClick={()=>void run(async()=>{await api.changeAdminCatalogStatus(kind,entry);afterSave('Cadastro arquivado.')})}>Confirmar arquivamento</button><button type="button" className={button} onClick={()=>setArchive(false)}>Cancelar</button></div></div>}
      {!!entry?.history?.length&&<details><summary className="cursor-pointer text-sm font-bold">Histórico de alterações</summary><ul className="mt-2 space-y-1 text-xs">{entry.history.map(item=><li key={item.version}>{actions[item.action]??item.action} · versão {item.version} · {new Date(item.createdAt).toLocaleString('pt-BR')}</li>)}</ul></details>}
    </section>}
  </div>;
}
