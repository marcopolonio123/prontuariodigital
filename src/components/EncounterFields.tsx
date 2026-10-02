import type { ReactNode } from 'react';
import DictationTextarea from './DictationTextarea';

export interface EncounterFieldsValue {
  type: string; occurredAt: string; organizationName: string; homeVisit: boolean; onlineVisit: boolean; title: string;
  symptoms: string; diagnosis: string; exams: string; prescriptions: string; notes: string;
}
export const ENCOUNTER_TYPES = [['consultation','Consulta'],['exam','Exame'],['hospitalization','Internação'],['procedure','Procedimento'],['therapy','Terapia/Fisioterapia'],['vaccine','Vacina'],['prescription','Receita/Prescrição'],['other','Outro']];
const narratives = [['symptoms','Sintomas / Queixa principal'],['diagnosis','Diagnóstico / Causa / Hipótese'],['exams','Exames'],['prescriptions','Receitas / Prescrições'],['notes','Observações']] as const;
const input = 'mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink';
/** Controlled fields only: each caller retains patient identity, permissions and save workflow. */
export default function EncounterFields({ value, onChange, children, locations }: { value: EncounterFieldsValue; onChange: (value: EncounterFieldsValue) => void; children?: ReactNode; locations?: Array<{id:string;name:string}> }) {
  const change = <K extends keyof EncounterFieldsValue>(key: K, next: EncounterFieldsValue[K]) => onChange({ ...value, [key]: next });
  return <>
    <label className="min-w-0 text-xs font-bold text-mute">Data/Hora (horário local)<input type="datetime-local" value={value.occurredAt} onChange={e=>change('occurredAt',e.target.value)} className={input}/></label>
    <div className="min-w-0"><label className="block text-xs font-bold text-mute">Hospital/Clínica/Consultório{value.homeVisit?' (opcional)':''}<input disabled={value.onlineVisit} value={value.organizationName} onChange={e=>change('organizationName',e.target.value)} className={input}/></label><label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={value.homeVisit} onChange={e=>onChange({...value,homeVisit:e.target.checked,onlineVisit:e.target.checked?false:value.onlineVisit})} className="h-4 w-4 accent-emerald-700"/>Atendimento domiciliar</label><label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={value.onlineVisit} onChange={e=>onChange({...value,onlineVisit:e.target.checked,homeVisit:e.target.checked?false:value.homeVisit})} className="h-4 w-4 accent-emerald-700"/>Atendimento on-line</label>{value.onlineVisit?<p className="mt-1 text-xs text-mute">Não é necessário informar o local.</p>:locations&&<label className="mt-2 block text-xs font-bold text-mute">Selecionar local cadastrado<select value={locations.some(item=>item.name===value.organizationName)?value.organizationName:''} onChange={e=>change('organizationName',e.target.value)} className={input}><option value="">Selecione ou informe o local acima</option>{locations.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}</div>
    <label className="min-w-0 text-xs font-bold text-mute">Tipo<select value={value.type} onChange={e=>change('type',e.target.value)} className={input}>{ENCOUNTER_TYPES.map(([type,label])=><option key={type} value={type}>{label}</option>)}</select></label>
    {children}
    <label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Atendimento (descrição)<input value={value.title} onChange={e=>change('title',e.target.value)} className={input}/></label>
    {narratives.map(([key,label])=><label key={key} className="min-w-0 text-xs font-bold text-mute sm:col-span-2">{label}<DictationTextarea rows={3} value={value[key]} onChange={next=>change(key,next)} className={input}/></label>)}
  </>;
}
