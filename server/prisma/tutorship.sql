-- Additive tutor migration; does not merge or delete existing people.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "tutorUserId" TEXT;

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "tutorManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "PersonIdentity" (
    "key" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonIdentity_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "TutorRequest" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "expectedTutorId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'ordinary',
    "relationship" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "TutorRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TutorDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TutorHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "oldTutorId" TEXT,
    "newTutorId" TEXT,
    "action" TEXT NOT NULL,
    "requestId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PatientIdentityDocument" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientIdentityDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PersonIdentity_patientId_idx" ON "PersonIdentity"("patientId");

CREATE INDEX IF NOT EXISTS "TutorRequest_requesterUserId_status_idx" ON "TutorRequest"("requesterUserId", "status");

CREATE INDEX IF NOT EXISTS "TutorRequest_patientId_status_idx" ON "TutorRequest"("patientId", "status");

CREATE INDEX IF NOT EXISTS "TutorDocument_requestId_idx" ON "TutorDocument"("requestId");

CREATE INDEX IF NOT EXISTS "TutorHistory_patientId_at_idx" ON "TutorHistory"("patientId", "at");

CREATE UNIQUE INDEX IF NOT EXISTS "PatientIdentityDocument_patientId_key" ON "PatientIdentityDocument"("patientId");

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Patient_tutorUserId_fkey') THEN ALTER TABLE "Patient" ADD CONSTRAINT "Patient_tutorUserId_fkey" FOREIGN KEY ("tutorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PersonIdentity_patientId_fkey') THEN ALTER TABLE "PersonIdentity" ADD CONSTRAINT "PersonIdentity_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TutorRequest_patientId_fkey') THEN ALTER TABLE "TutorRequest" ADD CONSTRAINT "TutorRequest_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TutorDocument_requestId_fkey') THEN ALTER TABLE "TutorDocument" ADD CONSTRAINT "TutorDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "TutorRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TutorHistory_patientId_fkey') THEN ALTER TABLE "TutorHistory" ADD CONSTRAINT "TutorHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PatientIdentityDocument_patientId_fkey') THEN ALTER TABLE "PatientIdentityDocument" ADD CONSTRAINT "PatientIdentityDocument_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;

UPDATE "Patient" SET "tutorUserId"="ownerUserId", "tutorManaged"=true WHERE "tutorManaged"=false AND data->>'relationshipToOwner' IN ('child','parent','guardian','dependent','other');

