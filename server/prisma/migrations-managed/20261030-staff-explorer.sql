CREATE TABLE IF NOT EXISTS "ProfessionalStaff" (id TEXT PRIMARY KEY,"professionalUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,"staffUserId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,status TEXT NOT NULL DEFAULT 'pending',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),UNIQUE("professionalUserId","staffUserId"));
CREATE INDEX IF NOT EXISTS "ProfessionalStaff_staffUserId_status_idx" ON "ProfessionalStaff"("staffUserId",status);
CREATE TABLE IF NOT EXISTS "ProfessionalStaffAudit" (id TEXT PRIMARY KEY,"linkId" TEXT NOT NULL REFERENCES "ProfessionalStaff"(id) ON DELETE CASCADE ON UPDATE CASCADE,"actorUserId" TEXT NOT NULL,action TEXT NOT NULL,"entityId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS "ProfessionalStaffAudit_linkId_createdAt_idx" ON "ProfessionalStaffAudit"("linkId","createdAt");
ALTER TABLE "AccessRequest" ADD COLUMN IF NOT EXISTS "submittedByUserId" TEXT;
ALTER TABLE "StorageFolder" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "StorageFolder" DROP CONSTRAINT IF EXISTS "StorageFolder_accountId_normalizedName_key";
DROP INDEX IF EXISTS "StorageFolder_accountId_normalizedName_key";
ALTER TABLE "StorageFolder" DROP CONSTRAINT IF EXISTS "StorageFolder_accountId_parentId_normalizedName_key";
DROP INDEX IF EXISTS "StorageFolder_accountId_parentId_normalizedName_key";
CREATE UNIQUE INDEX "StorageFolder_accountId_parentId_normalizedName_key" ON "StorageFolder"("accountId","parentId","normalizedName") NULLS NOT DISTINCT;
DO $checks$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ProfessionalStaff_status_check' AND conrelid='"ProfessionalStaff"'::regclass) THEN ALTER TABLE "ProfessionalStaff" ADD CONSTRAINT "ProfessionalStaff_status_check" CHECK(status IN ('pending','active','rejected','revoked') AND "professionalUserId"<>"staffUserId");END IF;
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='AccessRequest_submittedByUserId_fkey' AND conrelid='"AccessRequest"'::regclass) THEN ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_submittedByUserId_fkey" FOREIGN KEY("submittedByUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;END IF;
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='StorageFolder_parentId_accountId_fkey' AND conrelid='"StorageFolder"'::regclass) THEN ALTER TABLE "StorageFolder" ADD CONSTRAINT "StorageFolder_parentId_accountId_fkey" FOREIGN KEY("parentId","accountId") REFERENCES "StorageFolder"(id,"accountId") ON DELETE NO ACTION ON UPDATE NO ACTION;END IF;
END $checks$;
