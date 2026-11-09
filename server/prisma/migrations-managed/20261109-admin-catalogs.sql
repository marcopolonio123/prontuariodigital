CREATE TABLE IF NOT EXISTS "AdminCatalogEntry" (
  "id" TEXT PRIMARY KEY,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('insurers','medications','professionals','facilities')),
  "name" TEXT NOT NULL,
  "internalCode" TEXT,
  "description" TEXT NOT NULL DEFAULT '',
  "searchText" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("kind","identityKey")
);
CREATE INDEX IF NOT EXISTS "AdminCatalogEntry_kind_active_name_id_idx" ON "AdminCatalogEntry" ("kind","active","name","id");

CREATE TABLE IF NOT EXISTS "AdminCatalogRevision" (
  "id" TEXT PRIMARY KEY,
  "entryId" TEXT NOT NULL REFERENCES "AdminCatalogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('create','edit','archive','restore')),
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("entryId","version")
);
