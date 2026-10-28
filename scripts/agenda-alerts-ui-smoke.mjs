import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4187'],{stdio:'ignore'});process.on('exit',()=>server.kill());let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4187/');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('mydoctor.v1.sessionToken','agenda-fixture'));
 let settings={enabled:{appointments:true,medications:true,professionalDecision:true},leadMinutes:60,updatedAt:null,canReview:false},writes=0,settingsWrites=0;
 const date=new Date(),at=new Date(date.getFullYear(),date.getMonth(),15,10).toISOString(),local=new Date(Date.parse(at)-new Date(at).getTimezoneOffset()*60000).toISOString().slice(0,16);
 let rows=[{id:'return-1',title:'Retorno · Consulta',at,professional:'Dra. Ana',location:'Clínica',notes:'Retorno programado no prontuário.',source:'return',alert:true,status:'scheduled',updatedAt:at}];
 await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url()),p=url.pathname.replace('/api/v1',''),method=route.request().method();let body=[],status=200;
 if(p==='/alerts/settings'){if(method==='PUT'){const v=route.request().postDataJSON();settings={...settings,enabled:v.enabled,leadMinutes:v.leadMinutes,updatedAt:at};settingsWrites++;body={saved:true}}else body=settings}
 else if(p==='/alerts')body={items:[],total:0};
 else if(p==='/account')body={id:'u1',name:'Paciente fixture',email:'fixture@test',completed:true,isHealthProfessional:false};
 else if(p==='/profiles')body=[{id:'p1',record:'1',name:'Paciente fixture',source:'owned',relationship:'self'}];
 else if(p==='/admin/session')body={authorized:false};
 else if(p==='/patients/p1/agenda'){if(method==='POST'){const input=route.request().postDataJSON();writes++;if(input.id)rows=rows.map(r=>r.id===input.id?{...r,...input}:r);else rows.push({...input,id:'own-1',source:'personal',updatedAt:at});body={saved:true}}else body=rows}
 await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://127.0.0.1:4187/');await page.getByRole('button',{name:'Minha agenda',exact:true}).click();await page.locator('[data-query-id="return-1"]').waitFor();await page.locator('[data-query-id="return-1"]').click();await page.getByText('Retorno do prontuário',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Editar / cancelar consulta',exact:true}).count(),0);
 await page.getByRole('button',{name:'+ Nova consulta',exact:true}).click();const form=page.getByRole('form',{name:'Editar consulta da minha agenda'});await form.getByLabel('Profissional',{exact:true}).fill('Não salvar');await form.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(writes,0);
 await page.getByRole('button',{name:'+ Nova consulta',exact:true}).click();await form.getByLabel('Data e horário',{exact:true}).fill(local);await form.getByLabel('Profissional',{exact:true}).fill('Dr. Lucas');await form.getByLabel('Local',{exact:true}).fill('Consultório');await form.getByRole('button',{name:'Salvar consulta',exact:true}).click();await page.getByText('Consulta salva na sua agenda.',{exact:true}).waitFor();await page.locator('[data-query-id="own-1"]').waitFor();assert.equal(writes,1);assert.equal(await form.count(),0);
 await page.locator('[data-query-id="own-1"]').click();await page.getByRole('button',{name:'Editar / cancelar consulta',exact:true}).click();await form.getByLabel('Situação',{exact:true}).selectOption('cancelled');await form.getByRole('button',{name:'Salvar consulta',exact:true}).click();await page.waitForFunction(()=>document.body.textContent.includes('Cancelado'));assert.equal(rows.find(r=>r.id==='own-1').status,'cancelled');
 await page.getByRole('button',{name:'Abrir menu',exact:true}).click();await page.getByRole('button',{name:'Configuração de alertas',exact:true}).click();await page.getByRole('heading',{name:'Configuração de alertas',exact:true}).waitFor();await page.getByLabel('Horário de tomar medicamentos',{exact:true}).uncheck();await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();await page.getByText('Configuração de alertas salva.',{exact:true}).waitFor();assert.equal(settingsWrites,1);assert.equal(settings.enabled.medications,false);assert.equal(await page.getByText('Perfis profissionais aguardando validação (administradores)',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('Agenda/alertas UI: retornos, nova consulta, cancelar, editar situação, configuração por conta e visual responsivo OK',width);await page.close();
 }
}finally{await browser?.close();server.kill()}
