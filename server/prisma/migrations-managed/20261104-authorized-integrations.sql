CREATE TABLE IF NOT EXISTS "IntegrationClient" (
 id TEXT PRIMARY KEY, "sourceSystemId" TEXT NOT NULL UNIQUE REFERENCES "SourceSystem"(id) ON DELETE RESTRICT,
 "tokenHash" TEXT NOT NULL UNIQUE, active BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "IntegrationConsent" (
 id TEXT PRIMARY KEY, "clientId" TEXT NOT NULL REFERENCES "IntegrationClient"(id) ON DELETE RESTRICT,
 "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT,
 "authorizedByUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 categories JSONB NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(id,"clientId","patientId")
);
CREATE INDEX IF NOT EXISTS "IntegrationConsent_patientId_createdAt_idx" ON "IntegrationConsent"("patientId","createdAt");
CREATE TABLE IF NOT EXISTS "IntegrationImport" (
 id TEXT PRIMARY KEY, "clientId" TEXT NOT NULL REFERENCES "IntegrationClient"(id) ON DELETE RESTRICT,
 "patientId" TEXT NOT NULL REFERENCES "Patient"(id) ON DELETE RESTRICT,
 "consentId" TEXT NOT NULL REFERENCES "IntegrationConsent"(id) ON DELETE RESTRICT,
 category TEXT NOT NULL CHECK(category IN ('consultation','laboratory','imaging','prescription')),
 "identifierSystem" TEXT NOT NULL, "externalId" TEXT NOT NULL, version TEXT NOT NULL, digest TEXT NOT NULL,
 bundle JSONB NOT NULL, summary JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 "eventId" TEXT UNIQUE REFERENCES "HealthEvent"(id) ON DELETE RESTRICT,
 "reviewedByUserId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT, "reviewedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("clientId","patientId","identifierSystem","externalId",version),
 CONSTRAINT "IntegrationImport_consent_boundary" FOREIGN KEY("consentId","clientId","patientId") REFERENCES "IntegrationConsent"(id,"clientId","patientId") ON DELETE RESTRICT,
 CONSTRAINT "IntegrationImport_event_boundary" FOREIGN KEY("eventId","patientId") REFERENCES "HealthEvent"(id,"patientId") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "IntegrationImport_patientId_createdAt_idx" ON "IntegrationImport"("patientId","createdAt");
CREATE TABLE IF NOT EXISTS "IntegrationAudit" (
 id TEXT PRIMARY KEY, "clientId" TEXT NOT NULL REFERENCES "IntegrationClient"(id) ON DELETE RESTRICT,
 "consentId" TEXT REFERENCES "IntegrationConsent"(id) ON DELETE RESTRICT,
 "importId" TEXT REFERENCES "IntegrationImport"(id) ON DELETE RESTRICT,
 "actorUserId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT,
 action TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IntegrationAudit_clientId_createdAt_idx" ON "IntegrationAudit"("clientId","createdAt");
-- db push may have created tables without the additional patient-boundary constraints.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='IntegrationImport_consent_boundary') THEN
 ALTER TABLE "IntegrationImport" ADD CONSTRAINT "IntegrationImport_consent_boundary" FOREIGN KEY("consentId","clientId","patientId") REFERENCES "IntegrationConsent"(id,"clientId","patientId") ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='IntegrationImport_event_boundary') THEN
 ALTER TABLE "IntegrationImport" ADD CONSTRAINT "IntegrationImport_event_boundary" FOREIGN KEY("eventId","patientId") REFERENCES "HealthEvent"(id,"patientId") ON DELETE RESTRICT;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS "IntegrationSetup" (
 provider TEXT PRIMARY KEY CHECK(provider='rnds'), environment TEXT NOT NULL DEFAULT 'homologation' CHECK(environment IN ('homologation','production')),
 cnes TEXT NOT NULL, "requesterId" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
);
