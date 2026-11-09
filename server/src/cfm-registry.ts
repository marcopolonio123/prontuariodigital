import { request } from 'node:https';
import { SaxesParser } from 'saxes';

const endpoint = 'https://ws.cfm.org.br:8080/WebServiceConsultaMedicos/ServicoConsultaMedicos';
const soapNS = 'http://schemas.xmlsoap.org/soap/envelope/';
const serviceNS = 'http://servico.cfm.org.br/';
const limit = 64 * 1024;
const regions = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));

export class RegistryCheckError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const unavailable = () => new RegistryCheckError(503, 'Não foi possível confirmar o CRM no CFM. Tente novamente ou contate a administração.');
export const cfmRequired = () => Boolean(process.env.CFM_WS_KEY?.trim() || process.env.CFM_VALIDATION_REQUIRED === 'true');

function crmNumber(value: string, uf: string) {
  const plain = value.trim().toUpperCase().replace(/^300-EMFE-/, '').replace(/-P$/, '');
  const number = uf === 'RJ' ? plain.replace(/^52-/, '') : plain;
  if (!/^\d{1,7}$/.test(number) || Number(number) === 0) return '';
  return String(Number(number));
}

type RegistryInput = { registration: string; region: string | null; name: string };
type CouncilRecord = { crm?: string; uf?: string; nome?: string; situacao?: string; tipoInscricao?: string; codigoErro?: string };

// Read only the expected SOAP response; reject declarations/entities and repeated scalar fields.
export function parseCouncilRecord(xml: string): CouncilRecord {
  if (Buffer.byteLength(xml) > limit) throw unavailable();
  const parser = new SaxesParser({ xmlns: true });
  const path: string[] = [];
  const result: Record<string, string> = {};
  let records = 0, reading = '', value = '';
  parser.on('doctype', () => { throw unavailable(); });
  parser.on('error', () => { throw unavailable(); });
  parser.on('opentag', tag => {
    path.push(tag.local);
    if (path.length > 12) throw unavailable();
    if (path.length <= 2 && tag.uri !== soapNS || path.length === 3 && tag.uri !== serviceNS) throw unavailable();
    if (path.join('/') === 'Envelope/Body/ConsultarResponse/dadosMedico') records++;
    if (path.length === 5 && path.slice(0, 4).join('/') === 'Envelope/Body/ConsultarResponse/dadosMedico'
      && ['crm', 'uf', 'nome', 'situacao', 'tipoInscricao', 'codigoErro'].includes(tag.local)) {
      if (Object.hasOwn(result, tag.local)) throw unavailable();
      reading = tag.local;
      value = '';
    } else if (reading) throw unavailable();
  });
  parser.on('text', text => { if (reading) value += text; });
  parser.on('closetag', () => {
    if (reading && path.length === 5) { result[reading] = value.trim(); reading = ''; }
    path.pop();
  });
  parser.write(xml).close();
  if (records !== 1) throw unavailable();
  return result;
}

function lookup(body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(endpoint, {
      method: 'POST', minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '""', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      if (res.statusCode !== 200) { res.destroy(); reject(unavailable()); return; }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) { res.destroy(); reject(unavailable()); return; }
        chunks.push(chunk);
      });
      res.on('error', () => reject(unavailable()));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', () => reject(unavailable()));
    req.end(body);
  });
}

const normalizedName = (name: string) => name.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toUpperCase();

export async function checkCfmRegistration(input: RegistryInput, transport = lookup) {
  const key = process.env.CFM_WS_KEY?.trim();
  if (!key || !/^[\x21-\x7e]{8}$/.test(key)) throw unavailable();
  const uf = input.region?.toUpperCase().trim() ?? '';
  const crm = crmNumber(input.registration, uf);
  if (!crm || !regions.has(uf)) throw new RegistryCheckError(422, 'Confira o número do CRM e a UF no cadastro profissional.');
  const escapedKey = key.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = `<s:Envelope xmlns:s="${soapNS}" xmlns:c="${serviceNS}"><s:Body><c:Consultar><crm>${crm}</crm><uf>${uf}</uf><chave>${escapedKey}</chave></c:Consultar></s:Body></s:Envelope>`;
  let data: CouncilRecord;
  try { data = parseCouncilRecord(await transport(body)); } catch { throw unavailable(); }
  if (data.codigoErro === '8101') throw new RegistryCheckError(403, 'CRM não localizado no CFM. Confira o número e a UF.');
  if (data.codigoErro !== undefined || !data.crm || !data.uf || !data.nome || !data.situacao || !data.tipoInscricao) throw unavailable();
  if (data.uf !== uf || crmNumber(data.crm, uf) !== crm) throw unavailable();
  if (data.situacao !== 'A' || !['P', 'S'].includes(data.tipoInscricao)) {
    throw new RegistryCheckError(403, 'O CFM não confirmou inscrição principal ou secundária regular nesta UF. Solicite revisão do cadastro.');
  }
  if (normalizedName(data.nome) !== normalizedName(input.name)) {
    throw new RegistryCheckError(403, 'O nome do cadastro difere do registro no CFM. Solicite revisão de identidade.');
  }
  return { source: 'cfm_ws_consultar', checkedAt: new Date().toISOString(), crm, uf, status: 'A', registrationType: data.tipoInscricao };
}
