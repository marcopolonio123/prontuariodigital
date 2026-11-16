import { PDFDocument, PDFName, StandardFonts, rgb } from 'pdf-lib';

export interface RecordExportExam { id:string;originalFilename:string;mimeType:string;sizeBytes:number }
export interface RecordExportData {
  patient: {id:string;name:string;recordNumber:number};
  events: Array<{id:string;specialty:string;documents:RecordExportExam[];type:string;title:string;occurredAt:string;practitionerNameSnapshot:string|null;organizationNameSnapshot:string|null;locationNameSnapshot:string|null;fields:Array<[string,string]>}>;
}

const date=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
const labels:Record<string,string>={consultation:'Consulta',exam:'Exame',hospitalization:'Internação',procedure:'Procedimento',therapy:'Terapia / Fisioterapia',vaccine:'Vacina',prescription:'Receita / Prescrição',other:'Outro'};

export async function createRecordPdf(record:RecordExportData, exams:RecordExportExam[]=[], getExam?:(id:string)=>Promise<Uint8Array>) {
  const pdf=await PDFDocument.create();
  pdf.setTitle('MyDoctor — Exportação de prontuário');
  const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const supported=new Set(font.getCharacterSet());
  const clean=(value:string)=>Array.from(value.normalize('NFC').replace(/\r\n?/g,'\n').replace(/\t/g,' '),c=>c==='\n'||supported.has(c.codePointAt(0)!)?c:'?').join('');
  const ink=rgb(.10,.20,.16), muted=rgb(.28,.36,.33);
  let page=pdf.addPage([595.28,841.89]),y=792;
  const line=(text:string,size:number,heading=false)=>{
    if(y<64){page=pdf.addPage([595.28,841.89]);y=792;}
    page.drawText(text,{x:48,y,size,font:heading?bold:font,color:ink});y-=size+5;
  };
  function paragraph(value:string,size=11,heading=false) {
    const face=heading?bold:font;
    for(const part of clean(value).split('\n')){
      let row='';
      for(const word of part.split(/ +/)){
        const next=row?row+' '+word:word;
        if(face.widthOfTextAtSize(next,size)<=499){row=next;continue;}
        if(row)line(row,size,heading);
        row='';
        for(const char of word){
          if(face.widthOfTextAtSize(row+char,size)>499){line(row,size,heading);row='';}
          row+=char;
        }
      }
      line(row,size,heading);
    }
  }
  paragraph('MyDoctor | Prontuário',21,true);
  paragraph(record.patient.name,15,true);
  paragraph(`Prontuário nº ${record.patient.recordNumber} · Gerado em ${date.format(new Date())} (Brasília)`);
  paragraph('Dados de saúde confidenciais · Cópia para compartilhamento');
  paragraph(`Atendimentos selecionados: ${record.events.length} · Exames anexos: ${exams.length}`);
  y-=14;
  if(!record.events.length)paragraph('Nenhum atendimento disponível para exportação.');
  for(const event of record.events){
    if(y<138){page=pdf.addPage([595.28,841.89]);y=792;}
    paragraph(`${date.format(new Date(event.occurredAt))} · ${labels[event.type]??'Atendimento'}`,12,true);
    if(event.title&&event.title!==labels[event.type])paragraph(event.title);
    if(event.practitionerNameSnapshot)paragraph('Profissional: '+event.practitionerNameSnapshot);
    const place=[...new Set([event.organizationNameSnapshot,event.locationNameSnapshot].filter(Boolean))].join(' · ');
    if(place)paragraph('Local: '+place);
    for(const [label,value] of event.fields)paragraph(label+': '+value);
    for(const exam of event.documents.filter(doc=>exams.some(selected=>selected.id===doc.id)))paragraph('Exame no apêndice: '+exam.originalFilename);
    y-=12;
  }
  const pages=pdf.getPages();
  pages.forEach((p,i)=>{
    p.drawLine({start:{x:48,y:48},end:{x:547,y:48},color:muted,thickness:.5});
    p.drawText(`MyDoctor  |  Prontuário nº ${record.patient.recordNumber}  |  ${i+1}/${pages.length}`,{x:48,y:32,font,size:9,color:muted});
  });
  for (const exam of exams) {
    try {
      const bytes=await getExam!(exam.id);
      if(exam.mimeType==='application/pdf'){
        const original=await PDFDocument.load(bytes);
        if(original.getPageCount()>200)throw new Error();
        for(const p of await pdf.copyPages(original,original.getPageIndices())){
          p.node.delete(PDFName.of('Annots'));
          p.node.delete(PDFName.of('AA'));
          pdf.addPage(p);
        }
      } else {
        let imageBytes=bytes;
        if(exam.mimeType==='image/webp'){
          const bitmap=await createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:'image/webp'}));
          try {
            const canvas=document.createElement('canvas');
            const ratio=Math.min(1,2400/Math.max(bitmap.width,bitmap.height));
            canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
            canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
            const encoded=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error()),'image/png'));
            imageBytes=new Uint8Array(await encoded.arrayBuffer());
          } finally {bitmap.close();}
        }
        const image=exam.mimeType==='image/jpeg'?await pdf.embedJpg(imageBytes):await pdf.embedPng(imageBytes);
        const target=pdf.addPage([595.28,841.89]);
        const scaled=image.scale(Math.min(1,499/image.width,745/image.height));
        target.drawImage(image,{x:(595.28-scaled.width)/2,y:(841.89-scaled.height)/2,...scaled});
      }
    } catch {
      throw new Error(`Não foi possível incluir “${exam.originalFilename}”. Confira se o arquivo está disponível e legível, ou desmarque-o para exportar os demais.`);
    }
  }
  return pdf.save();
}
