/** Validação matemática, sem consulta a bases de emissão de documentos.
 * RG-SP: UFABC, Aritmética Modular e Criptografia, §4.2 (2013).
 * https://sca.profmat-sbm.org.br/busca_tcc_det.php?id=27155&id1=689
 */
export const BRAZIL_UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
export function normalizeCpf(value: string) { return value.trim().replace(/[.\s-]/g, ''); }
export function validCpf(value: string) {
  const cpf = normalizeCpf(value);
  return /^\d{11}$/.test(cpf) && !/^(\d)\1{10}$/.test(cpf) && [9,10].every(length => {
    const sum = cpf.slice(0,length).split('').reduce((total,digit,index) => total + Number(digit) * (length + 1 - index),0);
    return (sum * 10) % 11 % 10 === Number(cpf[length]);
  });
}
export function formatCpf(value: string) {
  return value.replace(/\D/g,'').slice(0,11).replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3}\.\d{3})(\d)/,'$1.$2').replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/,'$1-$2');
}
export function formatCep(value: string) { return value.replace(/\D/g,'').slice(0,8).replace(/^(\d{5})(\d)/,'$1-$2'); }
export function normalizeRg(value: string) { return value.trim().toUpperCase().replace(/[.\s-]/g,''); }
export function formatRg(value: string, uf: string, type: string) {
  if (type === 'CIN') return formatCpf(value);
  if (uf !== 'SP') return value.toUpperCase().slice(0,30);
  return value.toUpperCase().replace(/[^\dX]/g,'').slice(0,9).replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2}\.\d{3})(\d)/,'$1.$2').replace(/^(\d{2}\.\d{3}\.\d{3})([\dX])/,'$1-$2');
}
export function rgError(value: string, uf: string, type: string) {
  const rg = normalizeRg(value);
  if (!rg) return '';
  if (!['RG','CIN'].includes(type)) return 'Selecione RG estadual ou CIN.';
  if (type === 'CIN') return validCpf(value) ? '' : 'CIN inválida: confira os 11 números e os dígitos verificadores do CPF.';
  if (!BRAZIL_UFS.includes(uf)) return 'Informe a UF emissora do RG.';
  if (uf !== 'SP') return /^[A-Z0-9]{5,20}$/.test(rg) && /\d/.test(rg) && !/^(\d)\1+$/.test(rg) ? '' : 'Confira o formato do RG conforme o documento emitido.';
  if (!/^\d{8}[\dX]$/.test(rg) || /^(\d)\1{8}$/.test(rg)) return 'RG-SP deve ter 8 números e um dígito verificador (número ou X).';
  const sum = rg.slice(0,8).split('').reduce((total,digit,index) => total + Number(digit) * (index + 2),0);
  const check = (11 - sum % 11) % 11;
  return rg[8] === (check === 10 ? 'X' : String(check)) ? '' : 'Dígito verificador do RG-SP inválido. Confira o documento.';
}
