-- Additive preparation only. No file content is removed by this migration.
DO $migration$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['ProfessionalVerificationDocument','UserIdentityDocument','TutorDocument','PatientIdentityDocument'] LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "objectKey" TEXT, ADD COLUMN IF NOT EXISTS "storageProvider" TEXT, ADD COLUMN IF NOT EXISTS "storageBucket" TEXT',tbl);
  EXECUTE format('ALTER TABLE %I ALTER COLUMN content DROP NOT NULL',tbl);
  EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I ("objectKey")',tbl||'_objectKey_key',tbl);
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('%I',tbl)::regclass AND conname=tbl||'_storage_check') THEN
   EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK ((content IS NOT NULL AND "objectKey" IS NULL AND "storageProvider" IS NULL AND "storageBucket" IS NULL) OR (content IS NULL AND "objectKey" IS NOT NULL AND "storageProvider"=''s3'' AND "storageBucket" IS NOT NULL))',tbl,tbl||'_storage_check');
  END IF;
 END LOOP;
END $migration$;
CREATE TABLE IF NOT EXISTS "StorageDeletion" (id TEXT PRIMARY KEY,bucket TEXT NOT NULL,"objectKey" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT now(),attempts INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS "StorageDeletion_bucket_objectKey_key" ON "StorageDeletion"(bucket,"objectKey");
CREATE INDEX IF NOT EXISTS "StorageDeletion_nextAttemptAt_idx" ON "StorageDeletion"("nextAttemptAt");
