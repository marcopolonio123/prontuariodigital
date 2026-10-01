CREATE TABLE IF NOT EXISTS "ProfessionalVerificationDocument" (
 "id" TEXT PRIMARY KEY, "practitionerId" TEXT NOT NULL REFERENCES "Practitioner"("id") ON DELETE CASCADE,
 "kind" TEXT NOT NULL, "filename" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
 "sha256" TEXT NOT NULL, "content" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ProfessionalVerificationDocument_practitionerId_createdAt_idx" ON "ProfessionalVerificationDocument"("practitionerId", "createdAt");
