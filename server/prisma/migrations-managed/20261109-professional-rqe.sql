ALTER TABLE "ProfessionalRegistration" ADD COLUMN IF NOT EXISTS "rqe" TEXT;
ALTER TABLE "ProfessionalRegistration" ADD COLUMN IF NOT EXISTS "rqeSpecialty" TEXT;
ALTER TABLE "ProfessionalRegistration" ADD COLUMN IF NOT EXISTS "rqeVerifiedAt" TIMESTAMP(3);
