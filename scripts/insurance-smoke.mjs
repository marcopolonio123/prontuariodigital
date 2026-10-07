import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4179'],{stdio:'ignore'});
process.on('exit',()=>server.kill());let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4179/');break}catch{await new Promise(r=>setTimeout(r,250))}}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.addInitScript(()=>sessionStorage.setItem('mydoctor.v1.sessionToken','insurance-fixture'));
  const photo='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#cef"/><text x="40" y="100">Carteirinha teste</text></svg>').toString('base64');
  let events=Array.from({length:12},(_,i)=>({id:'ins-'+i,patientId:'p1',type:'insurance',title:'Convênio '+i,status:'final',occurredAt:new Date(Date.UTC(2026,0,i+1)).toISOString(),payload:{provider:i===0?'Saúde teste':'Operadora '+i,planName:'Plano A',holderName:'Titular teste',memberNumber:'000'+i,validity:'2099-12-31',notes:'Observação teste',cardFront:i===0?photo:null,cardBack:i===0?photo:null}}));
  events.push({...events[0],id:'foreign',patientId:'another-patient',payload:{provider:'Convênio de outra pessoa'}});
  const writes=[];
  await page.route('**/api/v1/**',route=>{
   const path=new URL(route.request().url()).pathname.replace('/api/v1',''),method=route.request().method();
   if(method!=='GET'){
    const body=route.request().postData()?route.request().postDataJSON():{};
    writes.push({path,method,body});
    const found=events.find(e=>path.includes('/events/'+e.id));
    if(found&&method==='PUT'){Object.assign(found,body,{status:'amended'});}
    if(found&&path.endsWith('/inactivate'))found.status='cancelled';
    if(found&&path.endsWith('/reactivate'))found.status='amended';
    if(path==='/patients/p1/events'&&method==='POST')events.push({id:'new-ins',patientId:'p1',...body,status:'final'});
   }
   const data=path==='/account'?{id:'u1',name:'Paciente teste',completed:true}:path==='/profiles'?[{id:'p1',name:'Paciente teste',source:'owned',relationship:'self'}]:path==='/patients/p1/events'?events:path==='/admin/session'?{authorized:false}:path.includes('/events/')?events.find(e=>path.includes('/events/'+e.id)):[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:4179/');await page.getByRole('button',{name:'Convênios',exact:true}).click();
  await page.locator('[data-insurance-id]').first().waitFor();assert.equal(await page.locator('[data-insurance-id]').count(),10);
  assert.equal(await page.getByText('Convênio de outra pessoa',{exact:true}).count(),0); assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0); await page.getByRole('button',{name:'Ordenar por Operadora / plano',exact:true}).click(); assert.equal(await page.locator('[data-insurance-id]').first().getAttribute('data-insurance-id'),'ins-0'); await page.getByRole('button',{name:'Ordenar por Operadora / plano',exact:true}).click();
  const filters=page.locator('details').filter({hasText:'Filtros de convênios'});
  await filters.locator('summary').click();
  const search=page.getByLabel('Pesquisar operadora, plano, carteirinha ou titular',{exact:true});
  await search.fill('saude');assert.equal(await page.locator('[data-insurance-id]').count(),10);
  await search.press('Enter');await page.locator('[data-insurance-id="ins-0"]').waitFor();assert.equal(await page.locator('[data-insurance-id]').count(),1);
  const row=page.locator('[data-insurance-id="ins-0"]');
  assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0); await row.click();
  const image=page.getByAltText('Frente da carteirinha',{exact:true});await image.waitFor();assert.equal(await image.evaluate(e=>getComputedStyle(e).objectFit),'contain');
  await page.getByRole('button',{name:'Ampliar Frente da carteirinha',exact:true}).click();
  await page.getByRole('dialog',{name:'Carteirinha — Frente da carteirinha',exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  assert.equal(await page.getByLabel('Convênio / operadora',{exact:true}).inputValue(),'Saúde teste');
  await page.getByLabel('Plano / categoria',{exact:true}).fill('Plano alterado');
  await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
  await page.getByText('Convênio salvo.',{exact:true}).waitFor();
  const update=writes.find(w=>w.method==='PUT');assert.equal(update.path,'/patients/p1/events/ins-0');assert.equal(update.body.payload.cardFront,photo);assert.equal(update.body.payload.cardBack,photo);assert.equal(update.body.payload.planName,'Plano alterado');
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Inativar',exact:true}).click();await page.getByText('Convênio inativado e preservado no histórico.',{exact:true}).waitFor();assert.equal(await row.count(),0);
  await page.getByLabel('Status do convênio',{exact:true}).selectOption('inactive');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await row.waitFor();await row.click();assert.equal(await page.getByRole('button',{name:'Editar',exact:true}).count(),0);
  await page.getByRole('button',{name:'Reativar',exact:true}).click();await page.getByText('Convênio reativado.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Limpar filtros',exact:true}).click();assert.equal(await search.inputValue(),'');assert.equal(await page.getByLabel('Status do convênio',{exact:true}).inputValue(),'active');
  await page.getByRole('button',{name:'+ Incluir convênio',exact:true}).click();await page.getByLabel('Convênio / operadora',{exact:true}).fill('Não salvar');
  await page.getByRole('button',{name:'Cancelar sem salvar',exact:true}).click();
  await page.getByRole('button',{name:'+ Incluir convênio',exact:true}).click();assert.equal(await page.getByLabel('Convênio / operadora',{exact:true}).inputValue(),'');
  await page.getByLabel('Convênio / operadora',{exact:true}).fill('Novo convênio teste');await page.getByRole('button',{name:'Salvar convênio',exact:true}).click();await page.getByText('Convênio salvo.',{exact:true}).waitFor();
  assert.equal(writes.filter(w=>w.path==='/patients/p1/events'&&w.method==='POST').length,1);
  assert.equal(events.find(e=>e.id==='ins-0').payload.cardFront,photo);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log('Convênios: filtros, perfil isolado, imagem inteira/ampliada, edição, fotos preservadas, inativação, reativação e cancelar OK',width);await page.close();
 }
}finally{await browser?.close();server.kill()}
