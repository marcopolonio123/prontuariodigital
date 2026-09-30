// Apenas durante build/deploy; nunca é importado pelo processo web.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.env.DATABASE_URL || process.env.NODE_ENV !== 'production') {
    console.info('MyDoctor: patches de recursos não executados (build sem banco de produção).');
    return;
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    for (const filename of ['consultant-usage.sql', 'medication-agenda.sql']) {
      await client.query(fs.readFileSync(path.join(__dirname, '..', 'prisma', filename), 'utf8'));
    }
    await client.query('COMMIT');
    console.info('MyDoctor: patches aditivos do Consultor e Agenda aplicados.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}
main().catch(() => {
  console.error('MyDoctor: não foi possível preparar o banco. Build interrompido; verifique conexão e permissões.');
  process.exitCode = 1;
});
