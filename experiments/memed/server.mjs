// Local-only pilot: no production host, MyDoctor auth, clinical database, or document persistence.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';

const port = 8792;
const origin = 'http://127.0.0.1:' + port;
const {MEMED_TEST_API_KEY:key, MEMED_TEST_SECRET_KEY:secret, MEMED_TEST_PRESCRIBER:prescriber} = process.env;
if (!key || !secret || !/^mydoctor-test-[a-z0-9-]{8,64}$/.test(prescriber ?? '')) {
  process.stderr.write('Configure as chaves de homologação e o identificador do prescritor fictício mydoctor-test-…\n');
  process.exit(1);
}

const routes = new Map(await Promise.all([
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/lab.js', 'lab.js', 'text/javascript; charset=utf-8'],
].map(async ([path,file,type]) => [path, {type, body: await readFile(new URL(file,import.meta.url))}])));

let last = 0;
createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self' https://*.memed.com.br; script-src 'self' https://*.memed.com.br; style-src 'self' 'unsafe-inline' https://*.memed.com.br; img-src 'self' data: blob: https://*.memed.com.br; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  const json = (status,body) => { res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body)); };
  if (req.headers.host !== '127.0.0.1:'+port) return json(403,{error:'Acesso local somente.'});
  const page = routes.get(req.url);
  if (req.method === 'GET' && page) { res.writeHead(200,{'Content-Type':page.type});return res.end(page.body); }
  if (req.method !== 'POST' || req.url !== '/token') return json(404,{error:'Rota inválida.'});
  if (req.headers.origin !== origin || req.headers['content-length'] && req.headers['content-length'] !== '0' || req.headers['transfer-encoding']) return json(403,{error:'Solicitação inválida.'});
  if (Date.now()-last < 5000) return json(429,{error:'Aguarde alguns segundos antes de tentar novamente.'});
  last = Date.now();
  try {
    const url = new URL('/v1/sinapse-prescricao/usuarios/'+encodeURIComponent(prescriber),'https://integrations.api.memed.com.br');
    url.search = new URLSearchParams({'api-key':key,'secret-key':secret});
    const response = await fetch(url,{headers:{Accept:'application/vnd.api+json'},signal:AbortSignal.timeout(8000),redirect:'error'});
    if (!response.ok) {
      await response.body?.cancel();
      return json(502,{error:response.status===404?'Prescritor fictício não localizado na homologação.':'A homologação da Memed não aceitou a consulta.'});
    }
    const data = (await response.json())?.data;
    const token = data?.attributes?.token;
    if (data?.type !== 'usuarios' || typeof token !== 'string' || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || token.length > 8192) return json(502,{error:'Token de homologação não retornado.'});
    return json(200,{token});
  } catch {
    return json(503,{error:'Não foi possível conectar à homologação da Memed.'});
  }
}).listen(port,'127.0.0.1',()=>process.stdout.write('Piloto local Memed: '+origin+'\n'));
