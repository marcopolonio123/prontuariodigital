import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(process.env.NODE_ENV!=='test')throw Error('Use somente banco isolado de teste.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const schema='directory_test_'+randomUUID().replaceAll('-','');
await db.connect();
const sql=await readFile(new URL('../prisma/migrations-managed/20261027-professional-directory.sql',import.meta.url),'utf8');
async function apply(){await db.query('BEGIN');try{await db.query(sql);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
const legacy={professionalLocations:[{id:'loc',name:'Clínica teste',address:'Rua teste, 10',active:true,fullAddress:{street:'Rua teste',number:'10',city:'São Paulo',state:'SP',postalCode:'01001000',country:'BR'},availability:[{weekday:1,start:'09:00',end:'17:00'}]}],professionalAgenda:[{id:'manual:test',title:'Consulta',at:'2026-11-01T12:00:00Z',locationId:'loc',patientId:'p',patientName:'Paciente teste',status:'scheduled'}],professionalAgendaOverrides:{e:{at:'2026-12-01T12:00:00Z',status:'completed'}}};
try{
 await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}"`);
 await db.query(`CREATE TABLE "User"(id text PRIMARY KEY,"accountData" jsonb);
 CREATE TABLE "Patient"(id text PRIMARY KEY);
 CREATE TABLE "Location"(id text PRIMARY KEY,name text NOT NULL,"addressLine1" text,"addressLine2" text,city text,state text,"postalCode" text,country text NOT NULL DEFAULT 'BR',"createdAt" timestamp NOT NULL DEFAULT now(),"updatedAt" timestamp NOT NULL DEFAULT now());
 CREATE TABLE "HealthEvent"(id text PRIMARY KEY,"authoredByUserId" text,"locationId" text REFERENCES "Location"(id),"organizationNameSnapshot" text,payload jsonb);
 INSERT INTO "User" VALUES('other','{}'); INSERT INTO "Patient" VALUES('p');
 INSERT INTO "HealthEvent" VALUES('e','doctor',null,'Clínica teste','{}'),('other-event','other',null,'Clínica teste','{}'),('home','doctor',null,'Clínica teste','{"homeVisit":true}');`);
 await db.query('INSERT INTO "User" VALUES($1,$2)', ['doctor',legacy]);
 // Invalid legacy references fail the entire transaction and preserve their source.
 await db.query(`UPDATE "User" SET "accountData"=jsonb_set("accountData",'{professionalAgenda,0,patientId}','"missing"') WHERE id='doctor'`);
 await assert.rejects(apply(),e=>e.code==='23503');
 assert.equal((await db.query('SELECT count(*)::int n FROM "Location"')).rows[0].n,0);
 assert.equal((await db.query(`SELECT "accountData"#>>'{professionalAgenda,0,patientId}' value FROM "User" WHERE id='doctor'`)).rows[0].value,'missing');
 await db.query('UPDATE "User" SET "accountData"=$1 WHERE id=\'doctor\'',[legacy]);
 await apply();await apply();
 const location=(await db.query('SELECT * FROM "Location" WHERE id=\'loc\'')).rows[0];
 assert.equal(location.number,'10');assert.equal(location.formattedAddress,'Rua teste, 10');
 assert.deepEqual((await db.query('SELECT weekday,"startMinute","endMinute" FROM "ProfessionalLocationAvailability"')).rows,[{weekday:1,startMinute:540,endMinute:1020}]);
 assert.equal((await db.query('SELECT "locationId" FROM "HealthEvent" WHERE id=\'e\'')).rows[0].locationId,'loc');
 assert.equal((await db.query('SELECT "locationId" FROM "HealthEvent" WHERE id=\'other-event\'')).rows[0].locationId,null);
 assert.equal((await db.query('SELECT "locationId" FROM "HealthEvent" WHERE id=\'home\'')).rows[0].locationId,null);
 const appt=(await db.query('SELECT * FROM "ProfessionalAppointment"')).rows[0];assert.equal(appt.patientId,'p');assert.equal(appt.locationId,'loc');assert.equal(appt.modality,'clinic');
 assert.equal((await db.query('SELECT status FROM "ProfessionalFollowUpState"')).rows[0].status,'completed');
 assert.deepEqual((await db.query('SELECT "accountData" FROM "User" WHERE id=\'doctor\'')).rows[0].accountData,legacy);
 await assert.rejects(db.query(`UPDATE "ProfessionalAppointment" SET "userId"='other'`),e=>e.code==='23503');
 await assert.rejects(db.query(`UPDATE "ProfessionalLocationAvailability" SET "endMinute"=500`),e=>e.code==='23514');
 await assert.rejects(db.query(`UPDATE "ProfessionalAppointment" SET status='unknown'`),e=>e.code==='23514');
 await assert.rejects(db.query(`UPDATE "ProfessionalAppointment" SET modality='online'`),e=>e.code==='23514');
 await assert.rejects(db.query(`DELETE FROM "ProfessionalLocation" WHERE id='loc'`),e=>e.code==='23503');
 // Re-running must not overwrite newer canonical data from the retained JSON.
 await db.query(`UPDATE "Location" SET name='Nome atualizado' WHERE id='loc'; UPDATE "ProfessionalAppointment" SET status='completed';`);
 await apply();
 assert.equal((await db.query('SELECT name FROM "Location" WHERE id=\'loc\'')).rows[0].name,'Nome atualizado');
 assert.equal((await db.query('SELECT status FROM "ProfessionalAppointment"')).rows[0].status,'completed');
 console.log('Professional directory migration: data preservation, rollback, idempotence, owner FK, availability checks and isolated event linking passed.');
}finally{await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();}
