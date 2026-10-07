import { useState, type ReactNode } from 'react';
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
export default function EncounterFields({ value, onChange, children, locations }: { value: EncounterFieldsValue; onChange: (value: EncounterFieldsValue) => void; children?: ReactNode; locations?: Array<{id:string;name:string;address?:string}> }) {
  const [manualLocal,setManualLocal]=useState(false);
  const selectedLocal=locations?.find(item=>item.name===value.organizationName);
  const showManual=manualLocal||!!value.organizationName&&!selectedLocal;
  const change = <K extends keyof EncounterFieldsValue>(key: K, next: EncounterFieldsValue[K]) => {const updated={...value,[key]:next};if(key==='occurredAt'&&value.followUp?.enabled&&value.followUp.period!=='custom'){const date=new Date(String(next));if(Number.isFinite(date.getTime())){date.setDate(date.getDate()+Number(value.followUp.period));updated.followUp={...value.followUp,at:new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}}}onChange(updated)};
  return <>
    <label className="min-w-0 text-xs font-bold text-mute">Data/Hora (horário local)<input type="datetime-local" value={value.occurredAt} onChange={e=>change('occurredAt',e.target.value)} className={input}/></label>
    <label className="min-w-0 text-xs font-bold text-mute">Tipo<select value={value.type} onChange={e=>change('type',e.target.value)} className={input}>{ENCOUNTER_TYPES.map(([type,label])=><option key={type} value={type}>{label}</option>)}</select></label>
    <div className="min-w-0 sm:col-span-2 grid gap-3 sm:grid-cols-2">{children}</div>
    <div className="min-w-0 sm:col-span-2 grid gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-xs font-bold text-mute">Modalidade / Tipo de local<select aria-label="Modalidade / Tipo de local" value={value.homeVisit?'home':value.onlineVisit?'online':'clinic'} onChange={e=>{setManualLocal(false);onChange({...value,homeVisit:e.target.value==='home',onlineVisit:e.target.value==='online',organizationName:''})}} className={input}><option value="clinic">Clínica / Consultório / Hospital / Outros</option><option value="home">Atendimento domiciliar</option><option value="online">Atendimento on-line</option></select></label>
      {!value.homeVisit&&!value.onlineVisit&&<><label className="min-w-0 text-xs font-bold text-mute">Local de atendimento<select aria-label="Local de atendimento" value={showManual?'other':selectedLocal?.name??''} onChange={e=>{setManualLocal(e.target.value==='other');change('organizationName',e.target.value==='other'?'':e.target.value)}} className={input}><option value="">Selecione o local</option>{locations?.map(item=><option key={item.id} value={item.name}>{item.name}</option>)}<option value="other">Outros — informar local</option></select></label>{selectedLocal&&!showManual&&<div className="text-xs text-mute sm:col-span-2"><strong>{selectedLocal.name}</strong>{selectedLocal.address&&<p>{selectedLocal.address}</p>}</div>}{showManual&&<label className="min-w-0 text-xs font-bold text-mute sm:col-span-2">Descrição do local<input aria-label="Descrição do local" value={value.organizationName} onChange={e=>change('organizationName',e.target.value)} className={input}/></label>}</>}
    </div>
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
