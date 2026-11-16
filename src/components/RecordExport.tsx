import { useEffect, useRef, useState } from 'react';
import { readV1SessionToken, type MyDoctorV1Api, type PatientProfile } from '../lib/api-v1';

export default function RecordExport({api,profile,isCurrent}:{api:MyDoctorV1Api;profile:PatientProfile;isCurrent:()=>boolean}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function download() {
    if(busy)return;
    const session=readV1SessionToken();
    setBusy(true);setMessage('');
    try {
      const [{createRecordPdf},record]=await Promise.all([import('../lib/record-pdf'),api.getRecordExport(profile.id)]);
      if(record.patient.id!==profile.id)throw new Error('O prontuário retornado não corresponde ao perfil selecionado.');
      const bytes=await createRecordPdf(record);
      if(!mounted.current||!isCurrent()||session!==readV1SessionToken())return;
      const url=URL.createObjectURL(new Blob([Uint8Array.from(bytes)],{type:'application/pdf'}));
      const link=document.createElement('a');
      link.href=url;link.download=`MyDoctor-prontuario-${record.patient.recordNumber}.pdf`;
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      setOpen(false);setMessage('PDF gerado. Confira o arquivo antes de encaminhar.');
    } catch(error) {setMessage(error instanceof Error?error.message:'Não foi possível gerar o PDF.');}
    finally {setBusy(false);}
  }
  return <div className="mt-3 text-sm">
    {!open?<button type="button" className="min-h-11 rounded-xl border border-line px-3 font-bold text-moss-800" onClick={()=>{setOpen(true);setMessage('');}}>Exportar PDF</button>:
      <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
        <p><strong>Exportar prontuário de {profile.name}?</strong></p>
        <p>Inclui todos os atendimentos ativos e confirmados, independentemente dos filtros da tela. Diário, histórico familiar, sinais vitais avulsos e arquivos anexos ficam de fora. O PDF contém dados de saúde e será baixado neste dispositivo.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} className="min-h-11 rounded-xl bg-pine-900 px-3 font-bold text-white disabled:opacity-50" onClick={()=>void download()}>{busy?'Gerando PDF…':'Baixar PDF'}</button>
          <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-line px-3 font-bold" onClick={()=>{setOpen(false);setMessage('');}}>Cancelar exportação</button>
        </div>
      </div>}
    {message&&<p role="status" className="mt-2">{message}</p>}
  </div>;
}
