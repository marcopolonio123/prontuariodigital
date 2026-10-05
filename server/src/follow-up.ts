export function normalizeFollowUp(value:any, occurredAt:Date){
  if(value===undefined||value===null||value.enabled===false)return {enabled:false};
  if(value.enabled!==true||!['30','60','90','180','custom'].includes(String(value.period)))throw new Error('Selecione um prazo válido para o retorno.');
  if(typeof value.at!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(value.at))throw new Error('Informe data e horário válidos para o retorno.');
  const at=new Date(value.at);if(!Number.isFinite(at.getTime())||at<=occurredAt)throw new Error('O retorno deve ser depois do atendimento.');
  return {enabled:true,period:String(value.period),at:at.toISOString(),alert:value.alert!==false};
}
