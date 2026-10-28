-- Supersedes initial test-only activation. No document paths or contents are moved.
ALTER TABLE "StorageAccount" ALTER COLUMN "limitBytes" SET DEFAULT 1000000000;
ALTER TABLE "StorageAccount" ALTER COLUMN "uploadsEnabled" SET DEFAULT true;
-- No payments were implemented by the previous release; all existing allowances
-- were test allowances. Preserve files, allow reads/deletes, and apply the free tier.
UPDATE "StorageAccount" SET "limitBytes"=1000000000,"uploadsEnabled"=true;
ALTER TABLE "StorageAccount" DROP CONSTRAINT IF EXISTS "StorageAccount_userId_fkey";
ALTER TABLE "StorageAccount" ADD CONSTRAINT "StorageAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE IF NOT EXISTS "StorageCart" ("accountId" TEXT PRIMARY KEY REFERENCES "StorageAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE,gb INTEGER NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now());
DO $checks$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='"StorageCart"'::regclass AND conname='StorageCart_gb_check') THEN ALTER TABLE "StorageCart" ADD CONSTRAINT "StorageCart_gb_check" CHECK (gb IN (5,10)); END IF;
END $checks$;
