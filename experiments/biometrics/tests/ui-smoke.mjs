import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('..',import.meta.url));
const directory=await mkdtemp(join(tmpdir(),'mydoctor-bio-ui-'));
const token=randomBytes(40).toString('hex');
const api=spawn(process.env.BIO_TEST_PYTHON||'python',['-m','uvicorn','app:create_app','--factory','--host','127.0.0.1','--port','8792','--no-access-log'],{
  cwd:root,stdio:['ignore','ignore','pipe'],env:{...process.env,BIO_LAB_ENABLED:'1',BIO_LAB_TOKEN:token,
    BIO_LAB_ENCRYPTION_KEY:randomBytes(32).toString('base64').replaceAll('+','-').replaceAll('/','_'),BIO_LAB_DATA:directory}});
let browser;
try{
  let ready=false;
  for(let i=0;i<80;i++){try{const response=await fetch('http://127.0.0.1:8792/health');if(response.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,250))}
  assert(ready,'Laboratory failed to start');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  for(const width of [390,1440]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:8792/');
    await page.getByLabel('Chave de acesso',{exact:true}).fill(token);
    await page.getByRole('button',{name:'Conectar',exact:true}).click();
    await page.getByText('Laboratório conectado. Nenhum dado da produção foi carregado.',{exact:true}).waitFor();
    await page.getByLabel('Código do voluntário',{exact:true}).fill('UI'+width);
    await page.locator('#volunteer-consent').check();
    await page.getByRole('button',{name:'Cadastrar voluntário',exact:true}).click();
    await page.getByText('Voluntário cadastrado. Capture amostras independentes.',{exact:true}).waitFor();
    await page.getByLabel('Modalidade',{exact:true}).selectOption('finger');
    await page.getByLabel('Tratamento',{exact:true}).selectOption('shadows');
    await page.getByLabel('Claro e escuro',{exact:true}).selectOption('negative');
    const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=360;c.height=420;const x=c.getContext('2d');x.fillStyle='#ddd';x.fillRect(0,0,360,420);x.strokeStyle='#222';for(let y=0;y<420;y+=9){x.beginPath();x.moveTo(0,y);x.lineTo(360,y);x.stroke()}return c.toDataURL('image/png').split(',')[1]});
    await page.locator('#file').setInputFiles({name:'synthetic-ridges.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await page.getByText('Imagem selecionada localmente. Nada foi enviado ainda.',{exact:true}).waitFor();
    await page.getByLabel('Largura física do recorte (mm)',{exact:true}).fill('18');
    await page.locator('#capture-consent').check();
    await page.getByRole('button',{name:'Ver tratamento da digital',exact:true}).click();
    await page.getByText('Prévia preparada. Nenhuma amostra foi cadastrada ou comparada.',{exact:true}).waitFor();
    await page.getByAltText('Prévia da digital com tratamento escolhido',{exact:true}).waitFor();
    assert.equal(await page.locator('#original').isVisible(),true);
    await page.getByRole('button',{name:'Descartar captura',exact:true}).click();
    assert.equal(await page.locator('#preview-section').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Revogar e excluir',exact:true}).click();
    await page.getByText('Participação revogada e amostras excluídas.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Encerrar sessão',exact:true}).click();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).length+Object.keys(sessionStorage).length),0);
    assert.deepEqual(errors,[]);
    console.log('Laboratório UI: consentimento, original/negativo, sombras, exclusão e viewport OK',width);
    await page.close();
  }
}finally{await browser?.close();api.kill();await new Promise(resolve=>{if(api.exitCode!==null)resolve();else api.once('exit',resolve)});await rm(directory,{recursive:true,force:true})}
