-- Patch aditivo e idempotente; executar antes de ativar o novo backend.
CREATE TABLE IF NOT EXISTS "ConsultantUsage" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "leaseUntil" TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "ConsultantUsage_userId_status_completedAt_idx"
  ON "ConsultantUsage"("userId", "status", "completedAt");
