-- Personal vault only. Does not move, charge or alter managed health documents.
CREATE TABLE IF NOT EXISTS "StorageAccount" ("userId" TEXT PRIMARY KEY REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,"limitBytes" BIGINT NOT NULL DEFAULT 5000000000,"usedBytes" BIGINT NOT NULL DEFAULT 0,"maxFiles" INTEGER NOT NULL DEFAULT 10000,"uploadsEnabled" BOOLEAN NOT NULL DEFAULT false,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS "StorageFolder" (id TEXT PRIMARY KEY,"accountId" TEXT NOT NULL REFERENCES "StorageAccount"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,name TEXT NOT NULL,"normalizedName" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),UNIQUE("accountId","normalizedName"),UNIQUE(id,"accountId"));
CREATE TABLE IF NOT EXISTS "StorageFile" (id TEXT PRIMARY KEY,"accountId" TEXT NOT NULL REFERENCES "StorageAccount"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,"folderId" TEXT,name TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',"mimeType" TEXT NOT NULL,"sizeBytes" INTEGER NOT NULL,sha256 TEXT NOT NULL,"objectKey" TEXT NOT NULL UNIQUE,"storageBucket" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),FOREIGN KEY("folderId","accountId") REFERENCES "StorageFolder"(id,"accountId") ON DELETE NO ACTION ON UPDATE CASCADE);
CREATE TABLE IF NOT EXISTS "StorageReservation" (id TEXT PRIMARY KEY,"accountId" TEXT NOT NULL REFERENCES "StorageAccount"("userId") ON DELETE CASCADE ON UPDATE CASCADE,"sizeBytes" INTEGER NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "StorageUpgradeRequest" ("accountId" TEXT PRIMARY KEY REFERENCES "StorageAccount"("userId") ON DELETE RESTRICT ON UPDATE CASCADE,"requestedLimitBytes" BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS "StorageFile_accountId_folderId_createdAt_idx" ON "StorageFile"("accountId","folderId","createdAt");
CREATE INDEX IF NOT EXISTS "StorageReservation_accountId_expiresAt_idx" ON "StorageReservation"("accountId","expiresAt");
DO $checks$
DECLARE item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('StorageAccount','StorageAccount_quota_check','"limitBytes">=0 AND "usedBytes">=0 AND "maxFiles">0'),
 ('StorageFile','StorageFile_namespace_check','left("objectKey",length(''storage/contas/''||"accountId"||''/''))=''storage/contas/''||"accountId"||''/'' AND "sizeBytes">0'),
 ('StorageReservation','StorageReservation_size_check','"sizeBytes">0'),
 ('StorageUpgradeRequest','StorageUpgradeRequest_status_check','status IN (''pending'',''approved'',''rejected'') AND "requestedLimitBytes">0')
 ) AS v(tbl,nm,expr) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('%I',item.tbl)::regclass AND conname=item.nm) THEN EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s)',item.tbl,item.nm,item.expr);END IF;
 END LOOP;
END $checks$;
