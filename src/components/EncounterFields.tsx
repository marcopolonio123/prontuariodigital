import type { ReactNode } from 'react';
import DictationTextarea from './DictationTextarea';

export interface FollowUpValue {enabled:boolean;period:string;at:string;alert:boolean}
export const emptyFollowUp=():FollowUpValue=>({enabled:false,period:'30',at:'',alert:true});
export const localFollowUp=(value:any):FollowUpValue=>value?.enabled?{...value,at:new Date(new Date(value.at).getTime()-new Date(value.at).getTimezoneOffset()*60000).toISOString().slice(0,16)}:emptyFollowUp();
export function savedFollowUp(value?:FollowUpValue){if(!value?.enabled)return {enabled:false};const at=new Date(value.at);if(!Number.isFinite(at.getTime()))throw new Error('Informe data e horário do retorno.');return {...value,at:at.toISOString()}}
export interface EncounterFieldsValue {
  followUp?:FollowUpValue;
  type: string; occurredAt: string; organizationName: string; homeVisit: boolean; onlineVisit: boolean; title: string;
  symptoms: string; diagnosis: string; exams: string; prescriptions: string; notes: string;
}
export const ENCOUNTER_TYPES = [['consultation','Consulta'],['exam','Exame'],['hospitalization','Internação'],['procedure','Procedimento'],['therapy','Terapia/Fisioterapia'],['vaccine','Vacina'],['prescription','Receita/Prescrição'],['other','Outro']];
const narratives = [['symptoms','Sintomas / Queixa principal'],['diagnosis','Diagnóstico / Causa / Hipótese'],['exams','Exames'],['prescriptions','Receitas / Prescrições'],['notes','Observações']] as const;
const input = 'mt-1 block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink';
/** Controlled fields only: each caller retains patient identity, permissions and save workflow. */
export default function EncounterFields({ value, onChange, children, locations }: { value: EncounterFieldsValue; onChange: (value: EncounterFieldsValue) => void; children?: ReactNode; locations?: Array<{id:string;name:string}> }) {
  const change = <K extends keyof EncounterFieldsValue>(key: K, next: EncounterFieldsValue[K]) => {const updated={...value,[key]:next};if(key==='occurredAt'&&value.followUp?.enabled&&value.followUp.period!=='custom'){const date=new Date(String(next));if(Number.isFinite(date.getTime())){date.setDate(date.getDate()+Number(value.followUp.period));updated.followUp={...value.followUp,at:new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}}}onChange(updated)};
  return <>
    <label className="min-w-0 text-xs font-bold text-mute">Data/Hora (horário local)<input type="datetime-local" value={value.occurredAt} onChange={e=>change('occurredAt',e.target.value)} className={input}/></label>
    <div className="min-w-0"><label className="block text-xs font-bold text-mute">Hospital/Clínica/Consultório{value.homeVisit?' (opcional)':''}<input disabled={value.onlineVisit} value={value.organizationName} onChange={e=>change('organizationName',e.target.value)} className={input}/></label><label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={value.homeVisit} onChange={e=>onChange({...value,homeVisit:e.target.checked,onlineVisit:e.target.checked?false:value.onlineVisit})} className="h-4 w-4 accent-emerald-700"/>Atendimento domiciliar</label><label className="mt-2 flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={value.onlineVisit} onChange={e=>onChange({...value,onlineVisit:e.target.checked,homeVisit:e.target.checked?false:value.homeVisit})} className="h-4 w-4 accent-emerald-700"/>Atendimento on-line</label>{value.onlineVisit?<p className="mt-1 text-xs text-mute">Não é necessário informar o local.</p>:locations&&<label className="mt-2 block text-xs font-bold text-mute">Selecionar local cadastrado<select value={locations.some(item=>item.name===value.organizationName)?value.organizationName:''} onChange={e=>change('organizationName',e.target.value)} className={input}><option value="">Selecione ou informe o local acima</option>{locations.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}</div>
    <label className="min-w-0 text-xs font-bold text-mute">Tipo<select value={value.type} onChange={e=>change('type',e.target.value)} className={input}>{ENCOUNTER_TYPES.map(([type,label])=><option key={type} value={type}>{label}</option>)}</select></label>
    {children}
    <label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Atendimento (descrição)<input value={value.title} onChange={e=>change('title',e.target.value)} className={input}/></label>
    {narratives.map(([key,label])=><label key={key} className="min-w-0 text-xs font-bold text-mute sm:col-span-2">{label}<DictationTextarea rows={3} value={value[key]} onChange={next=>change(key,next)} className={input}/></label>)}

  </>;
}



export function FollowUpFields({value,occurredAt,onChange,disabled=false}:{value?:FollowUpValue;occurredAt:string;onChange:(value:FollowUpValue)=>void;disabled?:boolean}){
  const followUp=value??emptyFollowUp();
  const suggest=(period:string)=>{const date=new Date(occurredAt);if(Number.isFinite(date.getTime())&&period!=='custom'){date.setDate(date.getDate()+Number(period));return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}return followUp.at};
  return <fieldset disabled={disabled} className="min-w-0">
    <div className="min-w-0 rounded-xl border border-line bg-paper p-3 sm:col-span-2"><label className="flex items-start gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={followUp.enabled} onChange={e=>onChange({...followUp,enabled:e.target.checked,at:followUp.at||suggest(followUp.period)})} style={{width:16,height:16,flex:'0 0 16px'}}/>Deseja agendar um retorno e receber um alerta?</label>{followUp.enabled&&<div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><label className="min-w-0 text-xs font-bold text-mute">Prazo para retorno<select value={followUp.period} onChange={e=>onChange({...followUp,period:e.target.value,at:suggest(e.target.value)})} className={input}>{['30','60','90','180'].map(days=><option key={days} value={days}>Em {days} dias</option>)}<option value="custom">Data e horário personalizados</option></select></label><label className="min-w-0 text-xs font-bold text-mute">Data/Hora do retorno<input type="datetime-local" value={followUp.at} onChange={e=>onChange({...followUp,period:'custom',at:e.target.value})} className={input}/></label><label className="flex items-center gap-2 text-xs text-ink"><input type="checkbox" checked={followUp.alert} onChange={e=>onChange({...followUp,alert:e.target.checked})} style={{width:16,height:16,flex:'0 0 16px'}}/>Mostrar alerta na data do retorno</label><p className="text-xs text-mute">Prazo contado da data do atendimento. O retorno é uma programação e não confirma disponibilidade do profissional. Nesta etapa, o alerta aparece ao acessar o site.</p></div>}</div>
  </fieldset>;
}
