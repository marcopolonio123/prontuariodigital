import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4177'],{stdio:'ignore'});
process.on('exit',()=>server.kill());let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4177/');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  let releaseAccount,accountStarted=false;
  const delayed=new Promise(r=>releaseAccount=r);
  await page.route('**/api/v1/**',async route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');
   if(path==='/account'){accountStarted=true;await delayed;}
   const data=path==='/auth/login/start'?{challengeId:'fixture',channel:'email',destinationMasked:'t***@example.test',expiresAt:new Date(Date.now()+600000).toISOString()}:path==='/auth/login/verify'?{token:'fixture-session',user:{id:'u1',name:'Teste',email:'fixture@example.test'}}:path==='/account'?{id:'u1',name:'Teste',email:'fixture@example.test',completed:false}:path==='/profiles'?[{id:'p1',name:'Teste',source:'owned',relationship:'self'},{id:'child',name:'Dependente',source:'owned',relationship:'child',isTutor:true}]:path==='/patients/p1/events'?[{id:'e1',patientId:'p1',type:'consultation',title:'Registro de teste',status:'final',occurredAt:'2026-10-07T12:00:00Z',payload:{}}]:path==='/admin/session'?{authorized:false}:[];
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:4177/');
  await page.locator('input[type=email]').fill('fixture@example.test');await page.locator('input[type=password]').fill('fixture-password');
  await page.locator('input[type=email]').focus();await page.keyboard.press('Enter');
  await page.getByLabel('Código de verificação',{exact:true}).fill('123456');await page.getByRole('button',{name:'Solicitar novo código',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByRole('button',{name:'Prontuário',exact:true}).waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Menu do MyDoctor',exact:true}).count(),1,'Login deve abrir o menu mesmo com cadastro incompleto e dependentes');
  assert.equal(await page.getByLabel('Menu configurações',{exact:true}).locator('..').evaluate(el=>el.open),false,'Configurações deve iniciar recolhido');
  assert.equal(await page.getByRole('navigation',{name:'Menu do MyDoctor',exact:true}).evaluate(el=>el.lastElementChild.querySelector('summary').textContent),'Configurações','Configurações deve ficar no final');
  await page.getByRole('button',{name:'Prontuário',exact:true}).click();
  await page.locator('[data-record-id="e1"]').waitFor();
  assert.equal(accountStarted,true);
  releaseAccount();
  await page.waitForTimeout(300);
  await page.locator('[data-record-id="e1"]').waitFor();
  assert.equal(await page.getByText('Escolha o que você precisa cuidar hoje.',{exact:true}).count(),0,'Conclusão do login sobrescreveu navegação');
  await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Início',exact:true}).count(),0);
  console.log('Navegação durante conclusão pendente do login OK',width);await page.close();
 }
}finally{await browser?.close();server.kill()}

