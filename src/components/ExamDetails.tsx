type Code={system:string;code:string;display?:string};
type Exam={reportCodes:Code[];orderedProcedures:Array<{name:string;codes:Code[]}>;results:Array<{name:string;codes:Code[];value:string;unitCode?:string|null;unitSystem?:string|null;referenceRange:string;interpretation:string}>};
const systemName=(system:string)=>system==='http://loinc.org'?'LOINC':system;
function Codes({codes}:{codes:Code[]}){
  return codes.length?<p className="break-all text-xs text-mute">{codes.map(c=>systemName(c.system)+' '+c.code).join(' · ')}</p>:null;
}
export default function ExamDetails({data}:{data:unknown}){
  if(!data||typeof data!=='object')return null;
  const exam=data as Exam;
  const validCodes=(codes:unknown):codes is Code[]=>Array.isArray(codes)&&codes.every(c=>c&&typeof c.system==='string'&&typeof c.code==='string');
  if(!validCodes(exam.reportCodes)||!Array.isArray(exam.results)||!Array.isArray(exam.orderedProcedures)||!exam.orderedProcedures.every(r=>r&&typeof r.name==='string'&&validCodes(r.codes))||!exam.results.every(r=>r&&typeof r.name==='string'&&typeof r.value==='string'&&typeof r.referenceRange==='string'&&typeof r.interpretation==='string'&&validCodes(r.codes)))return null;
  if(!exam.reportCodes.length&&!exam.results.length&&!exam.orderedProcedures.length)return null;
  return <section className="space-y-2 rounded-xl border border-line bg-white p-3 text-sm sm:col-span-2">
    <h4 className="font-bold">Exame e resultados da origem</h4>
    {exam.reportCodes.length>0&&<div><strong>Código do laudo</strong><Codes codes={exam.reportCodes}/></div>}
    {exam.orderedProcedures.map((item,i)=><div key={i} className="border-t border-line pt-2"><strong>Procedimento solicitado</strong><p className="break-words">{item.name}</p><Codes codes={item.codes}/></div>)}
    {exam.results.map((row,i)=><div key={i} className="border-t border-line pt-2"><strong className="break-words">{row.name}</strong><Codes codes={row.codes}/><p className="break-words">Resultado: {row.value}</p>{row.referenceRange&&<p className="break-words text-mute">Referência do laboratório: {row.referenceRange}</p>}{row.interpretation&&<p className="break-words text-mute">Interpretação da origem: {row.interpretation}</p>}</div>)}
  </section>;
}
