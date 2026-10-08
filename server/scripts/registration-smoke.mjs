import assert from 'node:assert/strict';
import {cleanupTutorshipFixtures} from './tutorship-fixtures.mjs';
process.env.PORT='8796';await import('../dist/index.js');const {prisma:db}=await import('../dist/db.js');
const ids=[],base='http://127.0.0.1:8796',password='Teste123!',email='registration-'+Date.now()+'@mydoctor.test';
const call=async(path,body)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()}};
try{
 for(let i=0;i<30;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const input={name:'Cadastro confirmação CI',email,password,passwordConfirmation:password,isHealthProfessional:true};
 assert.equal((await call('/api/v1/auth/register',{...input,passwordConfirmation:'Outra123!'})).status,400);assert.equal(await db.user.count({where:{email}}),0);
 const registered=await call('/api/v1/auth/register',input);assert.equal(registered.status,201);ids.push(registered.body.id);assert.equal(registered.body.token,undefined);assert.equal(registered.body.requiresEmailConfirmation,true);
 const patient=await db.patient.findFirst({where:{ownerUserId:ids[0]}});assert.equal(patient.data.isHealthProfessional,false);
 assert.equal((await call('/api/v1/auth/login/start',{email,password})).status,403);assert.equal((await call('/api/auth/login',{email,password})).status,403);
 const wrong=registered.body.developmentCode==='000000'?'111111':'000000';assert.equal((await call('/api/v1/auth/registration/verify',{challengeId:registered.body.challengeId,code:wrong})).status,401);assert.equal((await db.user.findUnique({where:{id:ids[0]}})).emailVerifiedAt,null);
 assert.equal((await call('/api/v1/auth/login/verify',{challengeId:registered.body.challengeId,code:registered.body.developmentCode})).status,400);
 assert.equal((await call('/api/v1/auth/registration/resend',{email,password:'wrong'})).status,401);assert.equal((await call('/api/v1/auth/registration/resend',{email,password})).status,429);
 await db.verificationChallenge.update({where:{id:registered.body.challengeId},data:{createdAt:new Date(Date.now()-61000)}});
 const resend=await call('/api/v1/auth/registration/resend',{email,password});assert.equal(resend.status,200);
 assert.equal((await call('/api/v1/auth/registration/verify',{challengeId:registered.body.challengeId,code:registered.body.developmentCode})).status,400);
 const verification={challengeId:resend.body.challengeId,code:resend.body.developmentCode};const race=await Promise.all([call('/api/v1/auth/registration/verify',verification),call('/api/v1/auth/registration/verify',verification)]);assert.deepEqual(race.map(r=>r.status).sort(),[200,400]);assert.equal(race.some(r=>r.body.token),false);
 assert.ok((await db.user.findUnique({where:{id:ids[0]}})).emailVerifiedAt);
 const start=await call('/api/v1/auth/login/start',{email,password});assert.equal(start.status,200);const login=await call('/api/v1/auth/login/verify',{challengeId:start.body.challengeId,code:start.body.developmentCode});assert.equal(login.status,200);assert.ok(login.body.token);
 assert.equal((await call('/api/v1/auth/registration/verify',{challengeId:start.body.challengeId,code:start.body.developmentCode})).status,400);
 const otherEmail='legacy-'+Date.now()+'@mydoctor.test';const legacy=await call('/api/auth/register',{...input,email:otherEmail});assert.equal(legacy.status,201);ids.push(legacy.body.id);assert.equal(legacy.body.token,undefined);assert.equal((await call('/api/auth/login',{email:otherEmail,password})).status,403);
 await db.verificationChallenge.update({where:{id:legacy.body.challengeId},data:{expiresAt:new Date(Date.now()-1000)}});assert.equal((await call('/api/v1/auth/registration/verify',{challengeId:legacy.body.challengeId,code:legacy.body.developmentCode})).status,400);
 console.log('✅ Cadastro: senhas iguais, flag profissional removida, confirmação de e-mail, reenvio, expiração, código único concorrente, MFA e bloqueio de rotas antigas OK.');
}finally{await cleanupTutorshipFixtures(db,ids);await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect()}
process.exit(0);
