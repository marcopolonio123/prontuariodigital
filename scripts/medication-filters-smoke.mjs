import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4178'],{stdio:'ignore'});
process.on('exit',()=>server.kill());let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4178/');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(()=>sessionStorage.setItem('mydoctor.v1.sessionToken','medication-fixture'));
  const schedules=Array.from({length:23},(_,i)=>({id:'med-'+i,patientId:'p1',name:'Medicamento '+i,dose:'10 mg',weekdays:[1],times:['08:00'],continuousUse:false,timezone:'America/Sao_Paulo',startsOn:'2026-10-01',endsOn:'2026-10-31',recipientIds:['p1'],alertsEnabled:false,active:true,updatedAt:'2026-10-01T12:00:00Z'}));
  schedules[21]={...schedules[21],name:'Temporário',weekdays:[3],recipientIds:['r2'],alertsEnabled:true,endsOn:'2026-10-05'};
  schedules[22]={...schedules[22],name:'Ácido fólico',dose:'5 mg',weekdays:[0,3],times:['07:00','19:00'],continuousUse:true,startsOn:'',endsOn:null,recipientIds:['r2'],alertsEnabled:true};
  let mutations=0;
  await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1','');
   if(route.request().method()!=='GET')mutations++;
   const data=path==='/account'?{id:'u1',name:'Paciente teste',completed:true}:path==='/profiles'?[{id:'p1',name:'Paciente teste',source:'owned',relationship:'self'}]:path==='/patients/p1/medications'?{schedules,alertsEnabled:true,canEdit:true,recipients:[{id:'p1',name:'Paciente teste',emailMasked:'p***@example.test',owner:true},{id:'r2',name:'Tutor teste',emailMasked:'t***@example.test',owner:false}]}:path==='/admin/session'?{authorized:false}:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:4178/');
  await page.getByRole('button',{name:'Agenda de medicamentos',exact:true}).click();
  const table=page.locator('table'),rows=page.locator('[data-medication-id]');
  await table.waitFor();assert.equal(await rows.count(),10);
  const filters=page.locator('details').filter({has:page.locator('summary').filter({hasText:'Filtros de pesquisa'})});
  assert.equal(await filters.getAttribute('open'),null);await filters.locator('summary').click();
  const search=page.getByLabel('Pesquisar medicamento, dose ou responsável',{exact:true});
  const apply=page.getByRole('button',{name:'Aplicar filtros',exact:true}),clear=page.getByRole('button',{name:'Limpar filtros',exact:true});
  const top=page.getByRole('navigation',{name:'Registros — paginação superior',exact:true});
  await top.getByRole('button',{name:'Próxima',exact:true}).click();await top.getByRole('button',{name:'Próxima',exact:true}).click();assert.equal(await rows.count(),3);
  await search.fill('acido');assert.equal(await rows.count(),3,'Pesquisa aplicada antes do botão');
  await search.press('Enter');assert.equal(await rows.count(),1);await rows.getByText('Ácido fólico',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Editar Ácido fólico',exact:true}).count(),0); await rows.first().click(); await page.getByRole('button',{name:'Editar Ácido fólico',exact:true}).click(); await page.getByRole('button',{name:'Cancelar',exact:true}).click(); assert.equal(await page.getByRole('button',{name:'Editar Ácido fólico',exact:true}).count(),1); assert.equal(await top.count(),0);await filters.getByText('Filtro ativo',{exact:true}).waitFor();
  await clear.click();assert.equal(await rows.count(),10);assert.equal(await search.inputValue(),'');
  await page.getByLabel('Dia da semana',{exact:true}).selectOption('0');await page.getByLabel('Tipo de uso',{exact:true}).selectOption('continuous');
  await page.getByLabel('Destinatário dos alertas',{exact:true}).selectOption('r2');await page.getByLabel('Alertas configurados',{exact:true}).selectOption('on');
  await page.getByLabel('Horário a partir de',{exact:true}).fill('07:00');await page.getByLabel('Horário até',{exact:true}).fill('07:00');await apply.click();assert.equal(await rows.count(),1);
  await page.getByLabel('Horário a partir de',{exact:true}).fill('13:00');await page.getByLabel('Horário até',{exact:true}).fill('16:00');await apply.click();
  await page.getByText('Nenhum medicamento encontrado. Revise ou limpe os filtros.',{exact:true}).waitFor();
  await page.getByLabel('Horário a partir de',{exact:true}).fill('19:00');await page.getByLabel('Horário até',{exact:true}).fill('07:00');await apply.click();
  await page.getByRole('alert').getByText('O horário final deve ser igual ou posterior ao inicial.',{exact:true}).waitFor();
  await clear.click();await page.getByLabel('Data no período de uso',{exact:true}).fill('2026-10-20');await page.getByLabel('Tipo de uso',{exact:true}).selectOption('period');await apply.click();
  await filters.getByText('21 de 23 medicamentos',{exact:true}).waitFor();
  await page.getByLabel('Destinatário dos alertas',{exact:true}).selectOption('r2');await apply.click();assert.equal(await table.count(),0);
  await clear.click();await search.fill('TUTOR');await apply.click();assert.equal(await rows.count(),2);
  await filters.locator('summary').click();assert.equal(await filters.getAttribute('open'),null);assert.equal(await rows.count(),2);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(mutations,0,'Filtros alteraram medicamentos');
  console.log('Medicamentos: filtros combinados, acentos, período, horário, paginação, Enter e limpar OK',width);await page.close();
 }
}finally{await browser?.close();server.kill()}
