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
  const [prepared,setPrepared]=useState<{file:File;session:string}|null>(null);
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
    setOpen(true);setPrepared(null);setRecord(null);setMessage('');setLoading(true);
    setStart('');setEnd('');setSpecialties([]);setIncludeExams(false);
    try{const value=await read(controller.signal);if(!controller.signal.aborted)setRecord(value);}
    catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Não foi possível carregar a exportação.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  }
  function save(file:File) {
    const url=URL.createObjectURL(file);
    const link=document.createElement('a');
    link.href=url;link.download=file.name;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    setPrepared(null);setOpen(false);setMessage('PDF baixado. Confira o arquivo antes de encaminhar.');
  }
  const isValid=(value:{session:string})=>isCurrent()&&value.session===readV1SessionToken();
  async function share() {
    if(!prepared||busy||!isValid(prepared))return;
    const data={files:[prepared.file]};
    if(!navigator.canShare?.(data)||typeof navigator.share!=='function'){
      setMessage('Neste navegador, baixe o PDF e anexe o arquivo ao e-mail ou WhatsApp.');
      return;
    }
    setBusy(true);setMessage('');
    try {
      await navigator.share(data);
      setMessage('Confira no aplicativo escolhido se o envio foi concluído.');
    } catch(error) {
      if(!(error instanceof DOMException&&error.name==='AbortError'))
        setMessage('Não foi possível abrir o compartilhamento. Baixe o PDF para anexá-lo manualmente.');
    } finally {setBusy(false);}
  }
  async function generate(forShare=false) {
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
      const file=new File([Uint8Array.from(bytes)],`MyDoctor-prontuario-${fresh.patient.recordNumber}.pdf`,{type:'application/pdf'});
      if(forShare)setPrepared({file,session});
      else save(file);
    } catch(error) {if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Não foi possível gerar o PDF.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  return <div className="mt-3 text-sm">
    {!open?<button type="button" className={button} onClick={()=>void prepare()}>Exportar PDF</button>:
      <div className="space-y-3 rounded-xl border border-line bg-paper p-3">
        <p><strong>Exportar prontuário de {profile.name}</strong></p>
        <p>Inclui apenas atendimentos ativos e confirmados. Use os filtros abaixo se quiser limitar o que será compartilhado.</p>
        {loading&&<p role="status">Carregando opções…</p>}
        {record&&<fieldset disabled={busy||!!prepared} className="space-y-3">
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
        {prepared&&<p role="status">{navigator.canShare?.({files:[prepared.file]})&&typeof navigator.share==='function'
          ? 'PDF pronto. Escolha e-mail, WhatsApp ou outro app disponível. Confira o destinatário antes de enviar.'
          : 'Seu navegador não compartilha arquivos diretamente. Baixe o PDF e anexe-o no e-mail ou WhatsApp.'}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy||loading||!events.length||invalid||tooLarge} className="min-h-11 rounded-xl bg-pine-900 px-3 font-bold text-white disabled:opacity-50" onClick={()=>{if(prepared){if(isValid(prepared))save(prepared.file);}else void generate();}}>Baixar PDF</button>
          {!prepared?<button type="button" disabled={busy||loading||!events.length||invalid||tooLarge} className={button} onClick={()=>void generate(true)}>Preparar para compartilhar</button>:
            <button type="button" disabled={busy||!navigator.canShare?.({files:[prepared.file]})||typeof navigator.share!=='function'} className={button} onClick={()=>void share()}>Compartilhar PDF</button>}
          <button type="button" disabled={busy} className={button} onClick={()=>{request.current?.abort();setPrepared(null);setOpen(false);setMessage('');}}>Cancelar exportação</button>
        </div>
        {busy&&<p role="status">Aguarde…</p>}
      </div>}
    {message&&<p role="status" className="mt-2">{message}</p>}
  </div>;
}
