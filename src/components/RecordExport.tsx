import { useEffect, useRef, useState } from 'react';
import { readV1SessionToken, type MyDoctorV1Api, type PatientProfile } from '../lib/api-v1';
import type { RecordExportData } from '../lib/record-pdf';

const dayFormat=new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeZone:'America/Sao_Paulo'});
const day=(date:string)=>dayFormat.format(new Date(date));
const button='min-h-11 rounded-xl border border-line px-3 font-bold';
const toggle=(values:string[],value:string)=>values.includes(value)?values.filter(item=>item!==value):[...values,value];

export default function RecordExport({api,profile,isCurrent}:{api:MyDoctorV1Api;profile:PatientProfile;isCurrent:()=>boolean}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
  const [record,setRecord]=useState<RecordExportData|null>(null);
  const [specialties,setSpecialties]=useState<string[]>([]),[start,setStart]=useState(''),[end,setEnd]=useState('');
  const [includeExams,setIncludeExams]=useState(false);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  const specialty=(event:RecordExportData['events'][number])=>event.specialty||'Sem especialidade informada';
  const options=[...new Set(record?.events.map(specialty))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const matches=(event:RecordExportData['events'][number])=>{
    const date=day(event.occurredAt);
    return (!specialties.length||specialties.includes(specialty(event)))&&(!start||date>=start)&&(!end||date<=end);
  };
  const events=record?.events.filter(matches)??[];
  const attachments=events.flatMap(event=>event.documents??[]);
  const exams=includeExams?attachments:[];
  const invalid=!!(start&&end&&start>end);
  const tooLarge=exams.length>20||exams.reduce((total,doc)=>total+doc.sizeBytes,0)>50*1024*1024;

  async function read(signal:AbortSignal) {
    const value=await api.getRecordExport(profile.id,signal);
    if(value.events.some(event=>!Array.isArray(event.documents)))throw new Error('A exportação está sendo atualizada. Tente novamente em instantes.');
    if(value.patient.id!==profile.id)throw new Error('O prontuário não corresponde ao perfil selecionado.');
    return value;
  }
  async function prepare() {
    request.current?.abort();
    const controller=new AbortController();request.current=controller;
    setOpen(true);setRecord(null);setMessage('');setLoading(true);
    setStart('');setEnd('');setSpecialties([]);setIncludeExams(false);
    try{const value=await read(controller.signal);if(!controller.signal.aborted)setRecord(value);}
    catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Não foi possível carregar a exportação.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  }
  async function download() {
    if(busy||!record||!events.length||invalid||tooLarge)return;
    const session=readV1SessionToken(),controller=new AbortController();request.current=controller;
    const eventIds=new Set(events.map(event=>event.id));
    setBusy(true);setMessage('');
    try {
      const [{createRecordPdf},fresh]=await Promise.all([import('../lib/record-pdf'),read(controller.signal)]);
      const current=fresh.events.filter(event=>eventIds.has(event.id)&&matches(event));
      const docs=new Map(current.flatMap(event=>(event.documents??[]).map(doc=>[doc.id,doc] as const)));
      if(current.length!==events.length||(includeExams&&(docs.size!==exams.length||exams.some(doc=>!docs.has(doc.id)))))throw new Error('O prontuário mudou. Feche e abra a exportação novamente para revisar a seleção.');
      const bytes=await createRecordPdf({...fresh,events:current},exams.map(doc=>docs.get(doc.id)!),id=>api.getRecordExportExam(profile.id,id,controller.signal));
      if(controller.signal.aborted||!isCurrent()||session!==readV1SessionToken())return;
      const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'application/pdf'}));
      const link=document.createElement('a');
      link.href=url;link.download=`MyDoctor-prontuario-${fresh.patient.recordNumber}.pdf`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      setOpen(false);setMessage('PDF gerado. Confira o arquivo antes de encaminhar.');
    } catch(error) {if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Não foi possível gerar o PDF.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="mt-3 text-sm">
    {!open?<button type="button" className={button} onClick={()=>void prepare()}>Exportar PDF</button>:
      <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
        <p><strong>Exportar prontuário de {profile.name}</strong></p>
        <p>Inclui apenas atendimentos ativos e confirmados. Use os filtros abaixo se quiser limitar o que será compartilhado.</p>
        {loading&&<p role="status">Carregando opções…</p>}
        {record&&<fieldset disabled={busy} className="space-y-3">
          {options.length>0&&<details className="rounded-lg border border-line p-2">
            <summary className="cursor-pointer font-semibold">Especialidades {specialties.length?`(${specialties.length} selecionadas)`:'(todas)'}</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {options.map(value=><label key={value} className="flex items-center gap-2"><input className="!w-auto" type="checkbox" checked={specialties.includes(value)} onChange={()=>{setSpecialties(toggle(specialties,value));}}/>{value}</label>)}
            </div>
          </details>}
          <div className="flex flex-wrap gap-3">
            <label>De (opcional)<input className="block rounded-lg border border-line p-2" type="date" value={start} onChange={e=>{setStart(e.target.value);}}/></label>
            <label>Até (opcional)<input className="block rounded-lg border border-line p-2" type="date" value={end} onChange={e=>{setEnd(e.target.value);}}/></label>
          </div>
          {invalid?<p role="alert">A data final deve ser igual ou posterior à inicial.</p>:<p>{events.length} atendimento(s) no PDF.</p>}
          <label className="flex items-center gap-2 font-semibold">
            <input className="!w-auto" type="checkbox" checked={includeExams} onChange={e=>setIncludeExams(e.target.checked)}/>
            Incluir exames anexos
          </label>
          <p>{attachments.length ? `${attachments.length} exame(s) anexado(s) aos atendimentos filtrados.` : 'Nenhum exame anexado aos atendimentos filtrados.'}</p>
          {tooLarge&&<p role="alert">Os anexos excedem o limite de 20 exames ou 50 MB. Restrinja o período ou as especialidades, ou exporte sem anexos.</p>}
        </fieldset>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy||loading||!events.length||invalid||tooLarge} className="min-h-11 rounded-xl bg-pine-900 px-3 font-bold text-white disabled:opacity-50" onClick={()=>void download()}>{busy?'Gerando PDF…':'Baixar PDF'}</button>
          <button type="button" disabled={busy} className={button} onClick={()=>{request.current?.abort();setOpen(false);setMessage('');}}>Cancelar exportação</button>
        </div>
      </div>}
    {message&&<p role="status" className="mt-2">{message}</p>}
  </div>;
}
