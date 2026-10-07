import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4176'],{stdio:'ignore'});
process.on('exit',()=>server.kill());let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4176/');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});let starts=0,verification;
  await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');
   if(path==='/auth/login/start'){starts++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({challengeId:'challenge-'+starts,channel:'email',destinationMasked:'t***@example.test',expiresAt:new Date(Date.now()+600000).toISOString()})})}
   if(path==='/auth/login/verify'){verification=route.request().postDataJSON();return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Código incorreto.'})})}
   return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await page.goto('http://127.0.0.1:4176/');await page.getByRole('heading',{name:'Entrar no MyDoctor',exact:true}).waitFor();
  await page.locator('input[type=email]').fill('teste@example.test');await page.locator('input[type=password]').fill('senha-de-fixture');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('heading',{name:'Confirme seu acesso',exact:true}).waitFor();
  const input=page.getByLabel('Código de verificação',{exact:true});await input.fill('123456');
  await page.getByRole('button',{name:'Solicitar novo código',exact:true}).click();await page.getByText('Novo código enviado para t***@example.test. Use o código mais recente.',{exact:true}).waitFor();
  assert.equal(starts,2);assert.equal(await input.inputValue(),'');assert.equal(await page.getByRole('button',{name:'Validar e entrar',exact:true}).isDisabled(),true);
  await input.fill('654321');await input.press('Enter');await page.getByText('Código incorreto.',{exact:true}).waitFor();
  assert.deepEqual(verification,{challengeId:'challenge-2',code:'654321'});assert.equal(await page.locator('[aria-label="Menu do MyDoctor"]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'← Voltar ao login',exact:true}).click();await page.getByRole('heading',{name:'Entrar no MyDoctor',exact:true}).waitFor();
  assert.equal(await page.locator('input[type=password]').inputValue(),'');assert.equal(await page.getByText('Código incorreto.',{exact:true}).count(),0);
  console.log('Código: reenvio, novo challenge, Enter, erro e retorno seguro OK',width);await page.close();
 }
}finally{await browser?.close();server.kill()}
