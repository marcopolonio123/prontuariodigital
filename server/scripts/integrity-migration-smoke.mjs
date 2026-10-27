import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
if(process.env.NODE_ENV!=='test')throw Error('Use somente banco isolado de teste.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const schema='integrity_test_'+randomUUID().replaceAll('-','');
await db.connect();
const sql=await readFile(new URL('../prisma/migrations-managed/20261027-integrity-v1.sql',import.meta.url),'utf8');
async function apply(){await db.query('BEGIN');try{await db.query(sql);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}}
async function rejects(statement){await assert.rejects(db.query(statement),error=>error.code==='23503');}
try{
 await db.query(`CREATE SCHEMA "${schema}"`);await db.query(`SET search_path TO "${schema}"`);
 await db.query(`
 CREATE TABLE "User"(id text PRIMARY KEY);
 CREATE TABLE "Patient"(id text PRIMARY KEY);
 CREATE TABLE "Practitioner"(id text PRIMARY KEY,"userId" text);
 CREATE TABLE "AccessRequest"(id text PRIMARY KEY,"requesterUserId" text NOT NULL,"practitionerId" text,"patientId" text NOT NULL,"decidedByUserId" text);
 CREATE TABLE "AccessGrant"(id text PRIMARY KEY,"patientId" text NOT NULL,"grantedByUserId" text,"practitionerId" text,"sourceRequestId" text);
 CREATE TABLE "HealthEvent"(id text PRIMARY KEY,"patientId" text NOT NULL,"authoredByUserId" text,"accessGrantId" text);
 CREATE TABLE "ClinicalDocument"(id text PRIMARY KEY,"patientId" text NOT NULL,"eventId" text);
 CREATE UNIQUE INDEX "HealthEvent_id_patientId_key" ON "HealthEvent"(id,"patientId");
 INSERT INTO "User" VALUES('owner'),('doctor');INSERT INTO "Patient" VALUES('a'),('b');
 INSERT INTO "AccessRequest" VALUES('orphan','missing',null,'a',null);`);
 await assert.rejects(apply(),error=>error.code==='23503');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM "AccessRequest"')).rows[0].n,1,'Migration removed orphan data');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype='f'")).rows[0].n,0,'Failed migration partially committed');
 await db.query('DELETE FROM "AccessRequest" WHERE id=\'orphan\'');
 await apply();await apply();
 assert.equal((await db.query("SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND contype='f' AND convalidated")).rows[0].n,12);
 await rejects('INSERT INTO "AccessRequest" VALUES(\'bad\',\'missing\',null,\'a\',null)');
 await rejects('INSERT INTO "Practitioner" VALUES(\'bad\',\'missing\')');
 await db.query(`INSERT INTO "Practitioner" VALUES('pr','doctor');INSERT INTO "AccessRequest" VALUES('r','doctor','pr','a','owner');INSERT INTO "AccessGrant" VALUES('g','a','owner','pr','r');`);
 await rejects('INSERT INTO "HealthEvent" VALUES(\'wrong\',\'b\',\'doctor\',\'g\')');
 await db.query('INSERT INTO "HealthEvent" VALUES(\'e\',\'a\',\'doctor\',\'g\')');
 await rejects('INSERT INTO "ClinicalDocument" VALUES(\'wrong\',\'b\',\'e\')');
 await db.query('INSERT INTO "ClinicalDocument" VALUES(\'d\',\'a\',\'e\')');
 await db.query('DELETE FROM "AccessGrant" WHERE id=\'g\'');
 const event=(await db.query('SELECT * FROM "HealthEvent" WHERE id=\'e\'')).rows[0];assert.equal(event.accessGrantId,null);assert.equal(event.patientId,'a');
 await db.query('DELETE FROM "HealthEvent" WHERE id=\'e\'');
 const doc=(await db.query('SELECT * FROM "ClinicalDocument" WHERE id=\'d\'')).rows[0];assert.equal(doc.eventId,null);assert.equal(doc.patientId,'a');
 console.log('Integrity migration: missing-FK backfill, idempotence, rollback without data loss, cross-patient rejection and partial SET NULL passed.');
}finally{await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();}
