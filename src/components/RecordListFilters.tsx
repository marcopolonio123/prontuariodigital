import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, ChevronDown } from 'lucide-react';
import type { HealthEventV1 } from '../lib/api-v1';
export type RecordSortKey = 'occurredAt' | 'type' | 'specialty' | 'practitioner';
const normalize = (text:string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const day = (date:string) => {const value=new Date(date);return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`};
const collator = new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
const defaults = {text:'',from:'',until:'',specialty:'',practitioner:''};
export function useRecordListFilters(events:HealthEventV1[],profileId:string|undefined,specialtyOf:(event:HealthEventV1)=>string,typeLabels:readonly (readonly string[])[]) {
  const [filters,setFilters]=useState(defaults),[sort,setSort]=useState<{key:RecordSortKey;direction:'asc'|'desc'}>({key:'occurredAt',direction:'desc'});
  const [applied,setApplied]=useState(defaults);
  const clear=()=>{setFilters(defaults);setApplied(defaults)};
  const apply=()=>{if(!invalidPeriod)setApplied({...filters})};
  useEffect(()=>{setFilters(defaults);setApplied(defaults);setSort({key:'occurredAt',direction:'desc'})},[profileId]);
  const typeOf=(event:HealthEventV1)=>typeLabels.find(([key])=>key===event.type)?.[1]??event.type;
  const options=(values:string[])=>[...new Set(values.map(value=>value.trim()).filter(Boolean))].sort(collator.compare);
  const specialties=options(events.map(specialtyOf)),practitioners=options(events.map(event=>event.practitionerNameSnapshot??''));
  const invalidPeriod=!!filters.from&&!!filters.until&&filters.from>filters.until;
  const rows=useMemo(()=>{
    const query=normalize(applied.text);
    const selected=events.filter(event=>{
      
      const specialty=specialtyOf(event).trim(),practitioner=event.practitionerNameSnapshot?.trim()??'',date=day(event.occurredAt);
      if(applied.from&&date<applied.from||applied.until&&date>applied.until)return false;
      if(applied.specialty&&(applied.specialty==='__none__'?!!specialty:specialty!==applied.specialty))return false;
      if(applied.practitioner&&(applied.practitioner==='__none__'?!!practitioner:practitioner!==applied.practitioner))return false;
      return !query||normalize([event.title,typeOf(event),specialty,practitioner,event.organizationNameSnapshot,event.payload.homeVisit?'Atendimento domiciliar':'',event.payload.onlineVisit?'Atendimento on-line':'',...['symptoms','diagnosis','exams','prescriptions','notes'].map(key=>typeof event.payload[key]==='string'?event.payload[key]:'')].join(' ')).includes(query);
    });
    const value=(event:HealthEventV1)=>sort.key==='type'?typeOf(event):sort.key==='specialty'?specialtyOf(event):event.practitionerNameSnapshot??'';
    return selected.sort((a,b)=>{const comparison=sort.key==='occurredAt'?Date.parse(a.occurredAt)-Date.parse(b.occurredAt):collator.compare(value(a),value(b));return comparison*(sort.direction==='asc'?1:-1)||Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.id.localeCompare(b.id)});
  },[events,applied,sort,specialtyOf,typeLabels]);
  const changeSort=(key:RecordSortKey)=>setSort(current=>({key,direction:current.key===key?(current.direction==='asc'?'desc':'asc'):key==='occurredAt'?'desc':'asc'}));
  return {filters,setFilters,applied,apply,sort,setSort,clear,rows,specialties,practitioners,invalidPeriod,changeSort};
}
export type RecordFiltersState = ReturnType<typeof useRecordListFilters>;
export function SortColumn({state,column,label}:{state:RecordFiltersState;column:RecordSortKey;label:string}) {const active=state.sort.key===column,Icon=active?(state.sort.direction==='asc'?ArrowUp:ArrowDown):ArrowUpDown;return <button type="button" aria-label={`Ordenar por ${label}`} aria-pressed={active} onClick={()=>state.changeSort(column)} className="flex min-h-10 items-center gap-2 text-left hover:text-moss-700"><span>{label}</span><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0"/></button>;}
export default function RecordListFilters({state,total}:{state:RecordFiltersState;total:number}) {
  const field='mt-1 block min-w-0 min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink';
  const change=(key:keyof typeof defaults,value:string)=>state.setFilters(current=>({...current,[key]:value}));
  const activeCount=Object.values(state.applied).filter(Boolean).length;
  return <div className="mt-4 rounded-xl border border-line bg-paper p-3 sm:p-4"><details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-moss-800"><span className="flex items-center gap-2"><Search aria-hidden="true" className="h-4 w-4"/>Filtros{activeCount>0&&<span className="rounded-full bg-moss-100 px-2 py-0.5 text-xs">{activeCount} ativos</span>}</span><ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180"/></summary><form onSubmit={e=>{e.preventDefault();state.apply()}} className="mt-3"><div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="min-w-0 text-xs font-bold text-mute"><span className="flex items-center gap-1"><Search aria-hidden="true" className="h-3.5 w-3.5"/>Buscar por texto</span><input id="record-filter-text" type="search" value={state.filters.text} onChange={e=>change('text',e.target.value)} placeholder="Descrição, sintomas, local…" className={field}/></label><label className="min-w-0 text-xs font-bold text-mute">Data inicial<input type="date" value={state.filters.from} onChange={e=>change('from',e.target.value)} className={field}/></label><label className="min-w-0 text-xs font-bold text-mute">Data final<input type="date" value={state.filters.until} onChange={e=>change('until',e.target.value)} className={field}/></label><label className="min-w-0 text-xs font-bold text-mute">Filtrar por especialidade<select value={state.filters.specialty} onChange={e=>change('specialty',e.target.value)} className={field}><option value="">Todas as especialidades</option>{state.specialties.map(item=><option key={item} value={item}>{item}</option>)}<option value="__none__">Especialidade não informada</option></select></label><label className="min-w-0 text-xs font-bold text-mute">Filtrar por profissional<select value={state.filters.practitioner} onChange={e=>change('practitioner',e.target.value)} className={field}><option value="">Todos os profissionais</option>{state.practitioners.map(item=><option key={item} value={item}>{item}</option>)}<option value="__none__">Profissional não informado</option></select></label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-mute">Preencha os campos e clique em Aplicar filtros.</p><div className="flex flex-wrap gap-2"><button type="submit" disabled={state.invalidPeriod} className="min-h-11 rounded-lg bg-moss-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Aplicar filtros</button><button type="button" onClick={state.clear} className="min-h-10 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold text-moss-800">Limpar filtros</button></div></div>{state.invalidPeriod&&<p role="alert" className="mt-2 text-xs font-semibold text-danger-600">A data final deve ser igual ou posterior à data inicial.</p>}</form></details><p role="status" className="mt-2 text-xs text-mute">{state.rows.length} de {total} atendimentos</p><div className="mt-3 flex flex-wrap items-end gap-2 md:hidden"><label className="min-w-0 flex-1 text-xs font-bold text-mute">Ordenar por<select aria-label="Ordenar por" value={state.sort.key} onChange={e=>state.changeSort(e.target.value as RecordSortKey)} className={field}><option value="occurredAt">Data/Hora</option><option value="type">Tipo</option><option value="specialty">Especialidade</option><option value="practitioner">Médico/Atendente</option></select></label><button type="button" onClick={()=>state.changeSort(state.sort.key)} className="min-h-11 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold">{state.sort.key==='occurredAt'?(state.sort.direction==='desc'?'Mais recentes':'Mais antigos'):(state.sort.direction==='asc'?'A → Z':'Z → A')}</button></div></div>;
}
