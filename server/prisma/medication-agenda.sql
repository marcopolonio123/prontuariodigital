-- Patch aditivo/idempotente. Executar antes de redeploy do backend, fora do runtime.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "medicationAlertsEnabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS "MedicationSchedule" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL, "dose" TEXT NOT NULL DEFAULT '',
  "weekdays" JSONB NOT NULL, "times" JSONB NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "startsOn" TEXT NOT NULL, "endsOn" TEXT,
  "recipientIds" JSONB NOT NULL,
  "alertsEnabled" BOOLEAN NOT NULL DEFAULT false, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MedicationSchedule_patientId_active_idx" ON "MedicationSchedule"("patientId", "active");
CREATE TABLE IF NOT EXISTS "MedicationReminderDelivery" (
  "id" TEXT PRIMARY KEY,
  "scheduleId" TEXT NOT NULL REFERENCES "MedicationSchedule"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "slotKey" TEXT NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempts" INTEGER NOT NULL DEFAULT 1,
  "leaseUntil" TIMESTAMP(3) NOT NULL, "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "MedicationReminderDelivery_scheduleId_userId_slotKey_key" ON "MedicationReminderDelivery"("scheduleId", "userId", "slotKey");
CREATE INDEX IF NOT EXISTS "MedicationReminderDelivery_dueAt_status_idx" ON "MedicationReminderDelivery"("dueAt", "status");
