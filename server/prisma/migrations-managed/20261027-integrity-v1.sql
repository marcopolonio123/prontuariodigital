-- 2026-10-27: align actual database constraints with Prisma and protect patient boundaries.
-- Additive migration. No UPDATE, DELETE or inferred repair of patient data.
DO $migration$
DECLARE ns text := current_schema();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessRequest"',ns)::regclass AND conname='AccessRequest_requesterUserId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessRequest" ADD CONSTRAINT "AccessRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES %I."User"(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessRequest" VALIDATE CONSTRAINT "AccessRequest_requesterUserId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessRequest"',ns)::regclass AND conname='AccessRequest_practitionerId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessRequest" ADD CONSTRAINT "AccessRequest_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES %I."Practitioner"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessRequest" VALIDATE CONSTRAINT "AccessRequest_practitionerId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessRequest"',ns)::regclass AND conname='AccessRequest_patientId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessRequest" ADD CONSTRAINT "AccessRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES %I."Patient"(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessRequest" VALIDATE CONSTRAINT "AccessRequest_patientId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessRequest"',ns)::regclass AND conname='AccessRequest_decidedByUserId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessRequest" ADD CONSTRAINT "AccessRequest_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES %I."User"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessRequest" VALIDATE CONSTRAINT "AccessRequest_decidedByUserId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessGrant"',ns)::regclass AND conname='AccessGrant_grantedByUserId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessGrant" ADD CONSTRAINT "AccessGrant_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES %I."User"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessGrant" VALIDATE CONSTRAINT "AccessGrant_grantedByUserId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessGrant"',ns)::regclass AND conname='AccessGrant_practitionerId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessGrant" ADD CONSTRAINT "AccessGrant_practitionerId_fkey" FOREIGN KEY ("practitionerId") REFERENCES %I."Practitioner"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessGrant" VALIDATE CONSTRAINT "AccessGrant_practitionerId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessGrant"',ns)::regclass AND conname='AccessGrant_sourceRequestId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."AccessGrant" ADD CONSTRAINT "AccessGrant_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES %I."AccessRequest"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."AccessGrant" VALIDATE CONSTRAINT "AccessGrant_sourceRequestId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."Practitioner"',ns)::regclass AND conname='Practitioner_userId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."Practitioner" ADD CONSTRAINT "Practitioner_userId_fkey" FOREIGN KEY ("userId") REFERENCES %I."User"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."Practitioner" VALIDATE CONSTRAINT "Practitioner_userId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."HealthEvent"',ns)::regclass AND conname='HealthEvent_authoredByUserId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."HealthEvent" ADD CONSTRAINT "HealthEvent_authoredByUserId_fkey" FOREIGN KEY ("authoredByUserId") REFERENCES %I."User"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."HealthEvent" VALIDATE CONSTRAINT "HealthEvent_authoredByUserId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."HealthEvent"',ns)::regclass AND conname='HealthEvent_accessGrantId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."HealthEvent" ADD CONSTRAINT "HealthEvent_accessGrantId_fkey" FOREIGN KEY ("accessGrantId") REFERENCES %I."AccessGrant"(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."HealthEvent" VALIDATE CONSTRAINT "HealthEvent_accessGrantId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."HealthEvent"',ns)::regclass AND conname='HealthEvent_id_patientId_key') THEN
    IF to_regclass(format('%I."HealthEvent_id_patientId_key"',ns)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I."HealthEvent" ADD CONSTRAINT "HealthEvent_id_patientId_key" UNIQUE USING INDEX "HealthEvent_id_patientId_key"',ns);
    ELSE
    EXECUTE format('ALTER TABLE %I."HealthEvent" ADD CONSTRAINT "HealthEvent_id_patientId_key" UNIQUE (id,"patientId")',ns);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."AccessGrant"',ns)::regclass AND conname='AccessGrant_id_patientId_key') THEN
    IF to_regclass(format('%I."AccessGrant_id_patientId_key"',ns)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I."AccessGrant" ADD CONSTRAINT "AccessGrant_id_patientId_key" UNIQUE USING INDEX "AccessGrant_id_patientId_key"',ns);
    ELSE
    EXECUTE format('ALTER TABLE %I."AccessGrant" ADD CONSTRAINT "AccessGrant_id_patientId_key" UNIQUE (id,"patientId")',ns);
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."ClinicalDocument"',ns)::regclass AND conname='ClinicalDocument_eventId_patientId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."ClinicalDocument" ADD CONSTRAINT "ClinicalDocument_eventId_patientId_fkey" FOREIGN KEY ("eventId","patientId") REFERENCES %I."HealthEvent"(id,"patientId") ON UPDATE CASCADE ON DELETE SET NULL ("eventId") NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."ClinicalDocument" VALIDATE CONSTRAINT "ClinicalDocument_eventId_patientId_fkey"',ns);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=format('%I."HealthEvent"',ns)::regclass AND conname='HealthEvent_accessGrantId_patientId_fkey') THEN
    EXECUTE format('ALTER TABLE %I."HealthEvent" ADD CONSTRAINT "HealthEvent_accessGrantId_patientId_fkey" FOREIGN KEY ("accessGrantId","patientId") REFERENCES %I."AccessGrant"(id,"patientId") ON UPDATE CASCADE ON DELETE SET NULL ("accessGrantId") NOT VALID',ns,ns);
  END IF;
  EXECUTE format('ALTER TABLE %I."HealthEvent" VALIDATE CONSTRAINT "HealthEvent_accessGrantId_patientId_fkey"',ns);
END
$migration$;
