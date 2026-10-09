import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const schema='sequence_test_'+randomUUID().replaceAll('-','');
await db.connect();
try {
 await db.query(`CREATE SCHEMA "${schema}"`);
 await db.query(`SET search_path TO "${schema}"`);
 for(const table of ['User','Patient']) {
  await db.query(`CREATE TABLE "${table}" (id text PRIMARY KEY,"createdAt" timestamp NOT NULL)`);
  await db.query(`INSERT INTO "${table}" VALUES ('new','2025-01-02'),('old','2025-01-01')`);
 }
 const sql=await readFile(new URL('../prisma/sequential-identifiers.sql',import.meta.url),'utf8');
 for(let i=0;i<2;i++){await db.query('BEGIN');await db.query(sql);await db.query('COMMIT');}
 for(const [table,col] of [['User','userNumber'],['Patient','recordNumber']]) {
  assert.deepEqual((await db.query(`SELECT "${col}" FROM "${table}" ORDER BY "createdAt"`)).rows.map(r=>r[col]),[1,2]);
  assert.equal((await db.query(`INSERT INTO "${table}"(id,"createdAt") VALUES ('third',now()) RETURNING "${col}"`)).rows[0][col],3);
 }
 await db.query('BEGIN');await db.query(sql);await db.query('COMMIT');
 assert.equal((await db.query('INSERT INTO "Patient"(id,"createdAt") VALUES (\'fourth\',now()) RETURNING "recordNumber"')).rows[0].recordNumber,4);
 console.log('Sequential identifiers: chronological backfill starts at 1, independent sequences, idempotence, stable numbers and future inserts passed.');
} finally {
 await db.query('ROLLBACK');await db.query('SET search_path TO public');await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await db.end();
}
