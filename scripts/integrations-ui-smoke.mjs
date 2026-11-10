import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4191'],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<40;i++){try{await fetch('http://127.0.0.1:4191');break}catch{await new Promise(r=>setTimeout(r,100))}}
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>sessionStorage.setItem('mydoctor.v1.sessionToken','fixture-token'));
  let admin=false,consents=[],approved=false;
  const openedCatalogs=[];
  const adminAccount={userNumber:8,name:'Conta teste',email:'conta@example.test',limitBytes:1e9,cartGb:20,profiles:1,dependents:1,received:0,granted:0};
  let accountQuery;

  const receipt={id:'receipt-1',category:'laboratory',status:'pending',externalId:'exam-1',version:'1',createdAt:'2026-11-04T14:00:00Z',summary:{title:'Glicemia',occurredAt:'2026-11-04T13:00:00Z',payload:{exams:'Glicose: 95 mg/dL (referência: 70–99)',notes:'Resultado de teste'}},client:{sourceSystem:{name:'Laboratório parceiro'}}};
  await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),p=u.pathname.replace(/^\/api\/v1/,''),method=route.request().method();let body=[];
   if(p==='/account')body={id:'owner',name:'Usuário teste',email:'fixture@test',completed:true};
   else if(p==='/profiles')body=[{id:'patient-1',name:'Usuário teste',record:'1',source:'owned',relationship:'self'}];
   else if(p==='/admin/session')body={authorized:admin};
   else if(p==='/alerts')body={items:[],total:0};
   else if(p==='/professional/profile')body={active:false};
   else if(p.startsWith('/admin/catalogs/')){assert(admin);openedCatalogs.push(p.split('/').at(-1));body={items:[],total:0,page:1,pageSize:10};}
   else if(p==='/admin/storage/plans'){assert(admin);body={checkoutEnabled:false,plans:[{gb:1,period:'unlimited',priceCents:0,currency:'BRL',purchasable:false},{gb:20,period:'month',priceCents:650,currency:'BRL',purchasable:false}]};}
   else if(p==='/admin/accounts'){assert(admin);accountQuery=u.searchParams;body={items:[adminAccount],total:11,page:Number(u.searchParams.get('page')),size:10};}
   else if(p==='/admin/accounts/8/relationships'){assert(admin);body={items:[{recordNumber:17,name:'Dependente teste',owner:adminAccount,tutor:adminAccount}],total:1,page:1,size:10};}
   else if(p==='/admin/overview'){assert(admin);body={observedAt:'2026-11-10T15:00:00Z',api:'responding',database:'responding',storageMode:'s3',checkoutEnabled:false,personalBytes:1234,totals:{accounts:10,profiles:10,dependents:1,tutors:1,accesses:2,professionals:1,storageAccounts:3}};}
   else if(p==='/integrations/clients')body=[{id:'lab-1',sourceSystem:{name:'Laboratório parceiro',code:'lab'}}];
   else if(p==='/patients/patient-1/integrations'){if(method==='POST'){const d=route.request().postDataJSON();assert.deepEqual(d.categories,['consultation','laboratory','imaging','prescription']);consents=[{id:'consent-1',...d,client:{active:true,sourceSystem:{name:'Laboratório parceiro'}}}];body=consents[0]}else body=consents;}
   else if(p==='/patients/patient-1/integration-imports')body={total:1,page:1,items:[{...receipt,status:approved?'approved':'pending'}]};
   else if(p==='/patients/patient-1/integration-imports/receipt-1')body={...receipt,bundle:{resourceType:'Bundle'},audit:[]};
   else if(p.endsWith('/receipt-1/decision')){assert.equal(route.request().postDataJSON().decision,'approve');approved=true;body={saved:true,eventId:'event-1'}}
   else if(p==='/integrations/rnds')body={connected:false,canConfigure:admin,setup:null,message:'Conexão clínica ainda não ativada. Requer credenciamento.'};
   else if(p==='/admin/integrations/rnds'){const d=route.request().postDataJSON();assert.equal(d.cnes,'1234567');body={saved:true,connected:false};}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const open=async()=>{const group=page.getByLabel('Menu configurações',{exact:true}).locator('..');await group.locator('summary').click();await page.getByRole('button',{name:'Autorizações de integração',exact:true}).click();};
  await page.goto('http://127.0.0.1:4191/');await open();await page.getByRole('heading',{name:'Autorizações de integração',exact:true}).waitFor();await page.getByRole('button',{name:'Nova autorização',exact:true}).click();await page.getByLabel('Empresa para autorizar',{exact:true}).selectOption('lab-1');await page.getByRole('button',{name:'Autorizar recebimento',exact:true}).click();await page.getByText('Laboratório parceiro · Vigente',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Anterior',exact:true}).count(),0);await page.getByRole('button',{name:'Ver detalhes',exact:true}).click();await page.getByRole('button',{name:'Confirmar e incorporar',exact:true}).click();await page.getByText('Registro incorporado ao prontuário.',{exact:true}).waitFor();assert(approved);
  assert.equal(await page.getByLabel('Menu administração',{exact:true}).count(),0);
  assert.equal(await page.getByText('Administrar empresas integradoras',{exact:true}).count(),0);
  admin=true;await page.reload();
  const adminGroup=page.getByLabel('Menu administração',{exact:true});
  const expandAdmin=async()=>{const group=adminGroup.locator('..');if(await group.getAttribute('open')===null)await group.locator('summary').click();};
  await adminGroup.waitFor({state:'attached'});
  assert.equal(await adminGroup.isVisible(),false);
  await expandAdmin();
  for(const [label,kind] of [['Administradoras de saúde','insurers'],['Medicamentos','medications'],['Profissionais','professionals'],['Estabelecimentos de saúde','facilities']]){
   await adminGroup.getByRole('button',{name:label,exact:true}).click();
   await page.getByRole('heading',{name:label,exact:true}).waitFor();
   await page.getByText('Nenhum registro encontrado neste filtro.',{exact:true}).waitFor();
   assert.equal(openedCatalogs.at(-1),kind);
   await page.getByRole('button',{name:'Voltar ao MyDoctor'}).click();
   await expandAdmin();
  }
  await adminGroup.getByRole('button',{name:'Validação de profissionais',exact:true}).click();
  await page.getByLabel('Filtrar por status').waitFor();
  await page.getByRole('button',{name:'Voltar ao MyDoctor'}).click();
  await expandAdmin();
  await adminGroup.getByRole('button',{name:'Integrações',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Nova autorização',exact:true}).count(),0);
  await page.getByText('SUS / RNDS · Conexão ainda não ativada',{exact:true}).click();await page.getByLabel('CNES',{exact:true}).fill('1234567');await page.getByLabel('Identificador do solicitante DATASUS',{exact:true}).fill('requester-test');await page.getByRole('button',{name:'Salvar preparação',exact:true}).click();await page.getByText('Preparação SUS/RNDS salva. Conexão clínica permanece inativa.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Voltar ao MyDoctor'}).click();
  await expandAdmin();
  await adminGroup.getByRole('button',{name:'Planos de armazenamento',exact:true}).click();
  await page.getByRole('cell',{name:'Sem vencimento',exact:true}).waitFor();
  await page.getByRole('cell',{name:/6,50/}).waitFor();
  await page.getByRole('button',{name:'Voltar ao MyDoctor'}).click();
  await expandAdmin();
  await adminGroup.getByRole('button',{name:'Usuários e vínculos',exact:true}).click();
  await page.getByText(/Filtros · 11 conta/).click();
  await page.getByLabel('Plano no carrinho').selectOption('20');
  await page.getByRole('button',{name:'Pesquisar',exact:true}).click();
  await page.getByText(/Filtro ativo · 11 conta/).waitFor();
  assert.equal(accountQuery.get('cart'),'20');
  const pagers=page.getByRole('navigation',{name:/Páginas de usuários/});
  assert.equal(await pagers.count(),2);
  await pagers.first().getByRole('button',{name:'Próxima',exact:true}).click();
  await pagers.first().getByText('Página 2 de 2').waitFor();
  await page.getByRole('button',{name:'Conta teste · Nº 8',exact:true}).click();
  await page.getByText('Dependente teste · Prontuário 17',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Voltar ao MyDoctor'}).click();
  await expandAdmin();
  await adminGroup.getByRole('button',{name:'Saúde do app',exact:true}).click();
  await page.getByText('S3/R2 selecionado',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Conta teste · Nº 8',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/mydoctor-integrations-'+width+'.png',fullPage:true});await page.close();console.log('Integration UI: consent, review, admin-only RNDS setup, no false connection, mobile layout OK',width);
 }
}finally{await browser?.close();server.kill()}
