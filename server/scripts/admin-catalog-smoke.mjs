import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import jwt from 'jsonwebtoken';

if(process.env.NODE_ENV!=='test')throw Error('Use apenas um banco de teste isolado.');
process.env.PORT='8809';
await import('../dist/index.js');
const {prisma:db}=await import('../dist/db.js');
const base='http://127.0.0.1:8809/api/v1/admin/catalogs/';
const accounts=[],entries=[];
async function account(confirmed){
  const user=await db.user.create({data:{name:'Conta fictícia',email:randomUUID()+'@catalog.test',passwordHash:'fixture',emailVerifiedAt:confirmed?new Date():null}});
  accounts.push(user.id);
  return {...user,token:jwt.sign({uid:user.id},process.env.JWT_SECRET)};
}
async function call(path,user,body,method=body?'POST':'GET'){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(user?{Authorization:'Bearer '+user.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
}
try{
  for(let i=0;i<30;i++){try{await fetch('http://127.0.0.1:8809/api/health');break;}catch{await delay(100)}}
  const admin=await account(true),ordinary=await account(true),unconfirmed=await account(false);
  process.env.MYDOCTOR_ADMIN_EMAILS=' '+admin.email.toUpperCase()+', '+unconfirmed.email;
  const baseInput={name:'Registro fictício',internalCode:'CAT-'+randomUUID().slice(0,8),description:'Cadastro local de teste'};
  assert.equal((await call('medications',null)).status,401);
  assert.equal((await call('medications?source=reference',ordinary)).status,403);
  assert.equal((await call('medications',unconfirmed,baseInput)).status,403);
  assert.equal((await call('invalid',admin,baseInput)).status,404);

  const records={};
  for(const kind of ['insurers','medications','professionals','facilities']){
    const r=await call(kind,admin,{...baseInput,active:false,version:100,source:'Oficial'});
    assert.equal(r.status,201,JSON.stringify(r.body));
    records[kind]=r.body;entries.push(r.body.id);
    assert.equal(r.body.active,true);
    assert.equal(r.body.version,1);
    assert.equal(r.body.source,undefined);
    const list=await call(kind+'?q='+baseInput.internalCode,admin);
    assert.deepEqual(list.body.items.map(row=>row.id),[r.body.id]);
  }
  const id=records.medications.id,path='medications/'+id;
  assert.equal((await call('facilities/'+id,admin)).status,404);
  assert.equal((await call(path,ordinary)).status,403);
  assert.equal((await call(path,ordinary,{...baseInput,expectedVersion:1},'PUT')).status,403);
  assert.equal((await call(path,ordinary,{expectedVersion:1},'DELETE')).status,403);
  assert.equal((await call('medications',admin,{...baseInput,internalCode:baseInput.internalCode.toLowerCase()})).status,409);
  const simultaneous=await Promise.all(['A','B'].map(s=>call(path,admin,{...baseInput,name:'Nome atualizado '+s,expectedVersion:1},'PUT')));
  assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
  assert.equal((await call(path,admin,{expectedVersion:1},'DELETE')).status,409);
  assert.equal((await call(path,admin,{expectedVersion:2},'DELETE')).status,200);
  assert.equal((await call('medications?q='+baseInput.internalCode,admin)).body.total,0);
  assert.equal((await call('medications?status=archived&q='+baseInput.internalCode,admin)).body.total,1);
  assert.equal((await call(path+'/restore',ordinary,{expectedVersion:3})).status,403);
  assert.equal((await call(path+'/restore',admin,{expectedVersion:3})).body.version,4);
  const detail=await call(path,admin);
  assert.deepEqual(detail.body.history.map(r=>r.action),['restore','archive','edit','create']);
  assert(detail.body.history.every(r=>r.actorId===admin.id));

  const reference=await call('medications?source=reference&q=paracetamol',admin);
  assert.equal(reference.status,200);
  assert(reference.body.items.length>0 && reference.body.items.every(item=>item.source==='Anvisa'));
  assert.equal((await call('medications/'+reference.body.items[0].id,admin,{...baseInput,expectedVersion:1},'PUT')).status,404);
  const freePath='medications?source=reference&benefit=free';
  const free=await call(freePath,admin);
  const freeNext=await call(freePath+'&page=2',admin);
  assert([free,freeNext].every(r=>r.status===200&&r.body.benefit==='free'&&r.body.items.length===10&&r.body.items.every(row=>row.pharmacyPopularEans>0)));
  assert.equal(freeNext.body.total,free.body.total);
  assert.equal(new Set([...free.body.items,...freeNext.body.items].map(row=>row.id)).size,20);
  const barcode=await call(freePath+'&q=7894916502900',admin);
  assert.deepEqual(barcode.body.items.map(row=>row.code),['105830220']);
  assert.equal((await call(freePath+'&q=0000000000000',admin)).body.total,0);
  assert.equal((await call('medications?benefit=free',admin)).status,400);
  assert.equal((await call(freePath,ordinary)).status,403);
  const first=await call('medications?source=reference&page=1&sort=asc',admin);
  const second=await call('medications?source=reference&page=2&sort=asc',admin);
  const reverse=await call('medications?source=reference&page=1&sort=desc',admin);
  assert([first,second,reverse].every(r=>r.status===200&&r.body.items.length===10));
  assert.equal(second.body.total,first.body.total);
  assert(free.body.total<first.body.total);
  assert.equal(second.body.page,2);
  assert.equal(new Set([...first.body.items,...second.body.items].map(item=>item.id)).size,20);
  const ordered=[...first.body.items,...second.body.items];
  assert(ordered.every((row,i)=>i===0||ordered[i-1].name.localeCompare(row.name,'pt-BR')<=0));
  assert(reverse.body.items.every((row,i)=>i===0||reverse.body.items[i-1].name.localeCompare(row.name,'pt-BR')>=0));
  assert.equal((await call('medications?sort=other',admin)).status,400);
  const ans=await call('insurers?source=reference&q=006246',admin);
  assert.equal(ans.status,200);assert.equal(ans.body.items[0].source,'ANS');
  assert.equal(await db.practitioner.count({where:{userId:{in:accounts}}}),0);
  console.log('Cadastros: e-mail confirmado, isolamento entre tipos, concorrência, arquivamento e auditoria verificados.');
}finally{
  await db.adminCatalogRevision.deleteMany({where:{entryId:{in:entries}}});
  await db.adminCatalogEntry.deleteMany({where:{id:{in:entries}}});
  await db.user.deleteMany({where:{id:{in:accounts}}});
  await db.$disconnect();
}
process.exit(0);
