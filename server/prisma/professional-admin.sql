CREATE TABLE IF NOT EXISTS "ProfessionalVerificationDecision" (
  "id" TEXT PRIMARY KEY,
  "practitionerId" TEXT NOT NULL REFERENCES "Practitioner"("id") ON DELETE CASCADE,
  "actorUserId" TEXT NOT NULL, "actorName" TEXT NOT NULL,
  "decision" TEXT NOT NULL, "previousStatus" TEXT NOT NULL, "status" TEXT NOT NULL,
  "note" TEXT NOT NULL, "evidence" TEXT, "registrationSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProfessionalVerificationDecision_practitionerId_createdAt_idx"
ON "ProfessionalVerificationDecision"("practitionerId", "createdAt");
