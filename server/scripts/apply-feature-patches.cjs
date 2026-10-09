// Executado em processo separado durante build ou preparação do entrypoint,
// antes de carregar o Prisma e de iniciar o servidor HTTP.
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  if (!process.env.DATABASE_URL || (process.env.NODE_ENV !== 'production' && !process.argv.includes('--startup'))) {
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
    await client.query("SELECT pg_advisory_xact_lock(734829105)");
    const ready = await client.query(`SELECT
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Patient' AND column_name = 'medicationAlertsEnabled') AS patient_ready,
      to_regclass('"ConsultantUsage"') IS NOT NULL AS consultant_ready,
      to_regclass('"MedicationSchedule"') IS NOT NULL AS schedule_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'MedicationSchedule' AND column_name = 'continuousUse') AS schedule_mode_ready,
      to_regclass('"MedicationReminderDelivery"') IS NOT NULL AS delivery_ready,
      to_regclass('"ProfessionalVerificationDecision"') IS NOT NULL AS admin_ready,
      to_regclass('"ProfessionalVerificationDocument"') IS NOT NULL AS documents_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'accountData') AS account_ready,
      to_regclass('"UserIdentityDocument"') IS NOT NULL AS identity_ready,
      to_regclass('"PersonIdentity"') IS NOT NULL AS person_identity_ready,
      to_regclass('"TutorRequest"') IS NOT NULL AS tutor_ready,
      to_regclass('"TutorDocument"') IS NOT NULL AS tutor_documents_ready,
      to_regclass('"TutorHistory"') IS NOT NULL AS tutor_history_ready,
      to_regclass('"PatientIdentityDocument"') IS NOT NULL AS patient_document_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Patient' AND column_name = 'tutorManaged') AS tutor_patient_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'Patient' AND column_name = 'recordNumber') AS record_ready,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'User' AND column_name = 'userNumber') AS user_number_ready`);
    if (Object.values(ready.rows[0]).every(value => value === true)) {
      await client.query('COMMIT');
      console.info('MyDoctor: schema dos recursos já preparado.');
      return;
    }
    for (const filename of ['consultant-usage.sql', 'medication-agenda.sql', 'professional-admin.sql', 'professional-documents.sql', 'account-details.sql', 'tutorship.sql', 'sequential-identifiers.sql']) {
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

