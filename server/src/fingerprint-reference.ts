import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
// Foto privada de referência do piloto. Não é template biométrico nem identificação ativa.
// JWT_SECRET é a raiz da chave derivada: sua rotação exige preservar/recriptografar referências.
const secret=()=>process.env.JWT_SECRET??'dev-only-mydoctor-jwt-secret-change-me';
export function referenceMetadata(value:any){return value?.version===1?{registeredAt:value.registeredAt,width:value.width,height:value.height,finger:value.finger,status:'pending_engine' as const}:null}
function dimensions(bytes:Buffer){
  if(bytes.length<8||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw new Error('Foto da digital inválida.');
  let offset=2;while(offset+4<bytes.length){if(bytes[offset]!==255)throw new Error('Foto da digital inválida.');while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===0xda||marker===0xd9)break;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)throw new Error('Foto da digital inválida.');if([0xc0,0xc1,0xc2].includes(marker)){if(length<8)break;return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)}}offset+=length;}throw new Error('Não foi possível conferir a resolução da digital.');
}
export function prepareReference(input:any,userId:string){
  if(input===null)return null;
  if(!input||input.consent!==true)throw new Error('Autorize o cadastro opcional da foto da digital ou descarte a foto.');
  if(!['right_index','left_index'].includes(input.finger))throw new Error('Selecione o dedo fotografado.');
  if(typeof input.photo!=='string'||input.photo.length>4*1024*1024||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(input.photo))throw new Error('Use uma foto da digital em JPEG de até 3 MB.');
  const bytes=Buffer.from(input.photo.split(',')[1],'base64'),size=dimensions(bytes);if(bytes.length>3*1024*1024||Math.min(size.width,size.height)<720||size.width*size.height>24000000)throw new Error('Foto da digital: use pelo menos 720 pixels em cada dimensão, até 24 megapixels e 3 MB.');
  const salt=randomBytes(16),iv=randomBytes(12),key=Buffer.from(hkdfSync('sha256',Buffer.from(secret()),salt,Buffer.from('mydoctor:fingerprint-reference:'+userId),32));
  const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(userId));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return {version:1,registeredAt:new Date().toISOString(),consentAt:new Date().toISOString(),consentVersion:'utility-identification-pilot-v1',finger:input.finger,...size,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
}
// Uso interno futuro pelo motor: não exposto em endpoints de prontuário ou administração.
export function decryptReference(value:any,userId:string){const key=Buffer.from(hkdfSync('sha256',Buffer.from(secret()),Buffer.from(value.salt,'base64'),Buffer.from('mydoctor:fingerprint-reference:'+userId),32));const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAAD(Buffer.from(userId));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]);}
