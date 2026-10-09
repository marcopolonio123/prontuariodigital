-- Add public sequential identifiers without changing internal IDs or relationships.
LOCK TABLE "User", "Patient" IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE IF NOT EXISTS "User_userNumber_seq" START WITH 1 MAXVALUE 999999999 NO CYCLE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "userNumber" INTEGER;
ALTER SEQUENCE "User_userNumber_seq" OWNED BY "User"."userNumber";
DO $$ DECLARE maximum bigint; last_number bigint; called boolean; item record;
BEGIN
 SELECT coalesce(max("userNumber"),0) INTO maximum FROM "User";
 SELECT last_value,is_called INTO last_number,called FROM "User_userNumber_seq";
 PERFORM setval('"User_userNumber_seq"', greatest(maximum,last_number), called OR maximum>0);
 FOR item IN SELECT id FROM "User" WHERE "userNumber" IS NULL ORDER BY "createdAt",id LOOP
  UPDATE "User" SET "userNumber"=nextval('"User_userNumber_seq"') WHERE id=item.id;
 END LOOP;
END $$;
ALTER TABLE "User" ALTER COLUMN "userNumber" SET DEFAULT nextval('"User_userNumber_seq"');
ALTER TABLE "User" ALTER COLUMN "userNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_userNumber_key" ON "User"("userNumber");
CREATE SEQUENCE IF NOT EXISTS "Patient_recordNumber_seq" START WITH 1 MAXVALUE 999999999 NO CYCLE;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "recordNumber" INTEGER;
ALTER SEQUENCE "Patient_recordNumber_seq" OWNED BY "Patient"."recordNumber";
DO $$ DECLARE maximum bigint; last_number bigint; called boolean; item record;
BEGIN
 SELECT coalesce(max("recordNumber"),0) INTO maximum FROM "Patient";
 SELECT last_value,is_called INTO last_number,called FROM "Patient_recordNumber_seq";
 PERFORM setval('"Patient_recordNumber_seq"', greatest(maximum,last_number), called OR maximum>0);
 FOR item IN SELECT id FROM "Patient" WHERE "recordNumber" IS NULL ORDER BY "createdAt",id LOOP
  UPDATE "Patient" SET "recordNumber"=nextval('"Patient_recordNumber_seq"') WHERE id=item.id;
 END LOOP;
END $$;
ALTER TABLE "Patient" ALTER COLUMN "recordNumber" SET DEFAULT nextval('"Patient_recordNumber_seq"');
ALTER TABLE "Patient" ALTER COLUMN "recordNumber" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_recordNumber_key" ON "Patient"("recordNumber");
