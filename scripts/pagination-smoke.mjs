import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4175'],{stdio:'ignore'});
process.on('exit',()=>server.kill());
let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4175/');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(()=>sessionStorage.setItem('mydoctor.v1.sessionToken','pagination-fixture'));
  const events=Array.from({length:23},(_,i)=>({id:'record-'+String(i).padStart(2,'0'),patientId:'p1',type:'consultation',title:'Consulta '+i,status:'final',occurredAt:new Date(Date.UTC(2026,8,i+1,12)).toISOString(),createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z',practitionerNameSnapshot:'Dra. Teste',payload:{specialty:'Clínica',notes:i===0?'Alvo distante':''}}));
  await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');
   const data=path==='/practitioners/doctor-fixture/locations'?[{id:'place-fixture',name:'Clínica Registro',address:'Rua teste, 20'}]:path==='/practitioners/lookup'?(new URL(route.request().url()).searchParams.get('region')==='SP'?{id:'doctor-fixture',name:'Dra. Registro',specialty:'Cardiologia',profession:'Médico'}:null):path==='/account'?{id:'u1',name:'Marco teste',email:'fixture@example.test',completed:true}:path==='/profiles'?[{id:'p1',name:'Marco teste',source:'owned',relationship:'self'}]:path==='/patients/p1/events'?events:path==='/admin/session'?{authorized:false}:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:4175/');await page.getByText('Olá, Marco.').waitFor();
  await page.getByRole('button',{name:'Prontuário',exact:true}).click();
  const top=page.getByRole('navigation',{name:'Atendimentos — paginação superior',exact:true});
  const bottom=page.getByRole('navigation',{name:'Atendimentos — paginação inferior',exact:true});
  await top.waitFor();await bottom.waitFor();assert.equal(await page.locator('[data-record-id]').count(),10);
  const seen=new Set(await page.locator('[data-record-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recordId)));
  await top.getByRole('button',{name:'Próxima',exact:true}).click();await bottom.getByText('Página 2 de 3',{exact:true}).waitFor();
  for(const id of await page.locator('[data-record-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recordId)))seen.add(id);
  await bottom.getByRole('button',{name:'Próxima',exact:true}).click();await top.getByText('Página 3 de 3',{exact:true}).waitFor();assert.equal(await page.locator('[data-record-id]').count(),3);
  for(const id of await page.locator('[data-record-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.recordId)))seen.add(id);
  assert.equal(seen.size,23);assert.equal(await top.getByRole('button',{name:'Próxima',exact:true}).isDisabled(),true);
  await bottom.getByRole('combobox').selectOption('20');await top.getByText('Página 1 de 2',{exact:true}).waitFor();assert.equal(await page.locator('[data-record-id]').count(),20);
  await top.getByRole('button',{name:'Próxima',exact:true}).click();
  await page.locator('summary').filter({hasText:/^Filtros/}).click();await page.locator('#record-filter-text').fill('Alvo distante');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await page.locator('[data-record-id="record-00"]').waitFor();assert.equal(await page.locator('[data-record-id]').count(),1);assert.equal(await top.count(),0);assert.equal(await bottom.count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'/tmp/mydoctor-pagination-'+width+'.png',fullPage:true});
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();assert.equal(await page.locator('[data-record-id]').count(),20);await top.waitFor();await bottom.waitFor();
  await page.getByRole('button',{name:'+ Adicionar Atendimento',exact:true}).click();
  await page.getByPlaceholder('Número',{exact:true}).fill('65000');
  const registry=page.locator('label').filter({hasText:/^CRM\/CREFITO/}).first();
  await registry.locator('select').last().selectOption('SP');
  await page.waitForFunction(()=>[...document.querySelectorAll('label')].find(label=>label.textContent.startsWith('Nome do Médico/Fisioterapeuta/Atendente'))?.querySelector('input')?.value==='Dra. Registro');
  assert.equal(await page.getByLabel('Especialidade',{exact:true}).inputValue(),'Cardiologia');
  await page.getByText('Profissional localizado: Dra. Registro · Cardiologia. Nome e especialidade preenchidos. Confira os dados.',{exact:true}).waitFor();
  const mode=page.getByLabel('Modalidade / Tipo de local',{exact:true}),place=page.getByLabel('Local de atendimento',{exact:true});
  await place.selectOption('Clínica Registro');
  await page.getByText('Rua teste, 20',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Descrição do local',{exact:true}).count(),0);
  await place.selectOption('other');
  await page.getByLabel('Descrição do local',{exact:true}).fill('Local manual');
  await mode.selectOption('home');
  assert.equal(await place.count(),0);assert.equal(await page.getByLabel('Descrição do local',{exact:true}).count(),0);
  await mode.selectOption('online');
  assert.equal(await place.count(),0);
  await mode.selectOption('clinic');
  assert.equal(await place.inputValue(),'');
  await registry.locator('select').last().selectOption('RJ');
  await page.getByText('Nenhum profissional validado encontrado com este conselho, registro e UF. Você pode preencher os dados manualmente.',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await place.locator('option').filter({hasText:'Clínica Registro'}).count(),0,'Locais do médico anterior permaneceram após trocar UF');
  await place.selectOption('other');assert.equal(await page.getByLabel('Descrição do local',{exact:true}).inputValue(),'');
  await page.screenshot({path:'/tmp/mydoctor-encounter-flow-'+width+'.png',fullPage:true});
  console.log('Busca automática e especialidade por registro OK',width);
  console.log('Paginação, controles sincronizados, 23 registros e filtros OK',width);await page.close();
 }
}finally{await browser?.close();server.kill()}
