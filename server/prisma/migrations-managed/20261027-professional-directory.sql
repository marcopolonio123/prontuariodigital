-- Normalize the professional directory and agenda, retaining legacy JSON for rollback.
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS number TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "formattedAddress" TEXT;
CREATE TABLE IF NOT EXISTS "ProfessionalLocation" (
 id TEXT PRIMARY KEY REFERENCES "Location"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "normalizedName" TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CONSTRAINT "ProfessionalLocation_userId_normalizedName_key" UNIQUE("userId","normalizedName"),
 CONSTRAINT "ProfessionalLocation_id_userId_key" UNIQUE(id,"userId")
);
CREATE TABLE IF NOT EXISTS "ProfessionalLocationAvailability" (
 "locationId" TEXT NOT NULL REFERENCES "ProfessionalLocation"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 weekday INTEGER NOT NULL,"startMinute" INTEGER NOT NULL,"endMinute" INTEGER NOT NULL,
 PRIMARY KEY("locationId",weekday,"startMinute")
);
CREATE TABLE IF NOT EXISTS "ProfessionalAppointment" (
 id TEXT PRIMARY KEY,"userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "patientId" TEXT REFERENCES "Patient"(id) ON DELETE SET NULL ON UPDATE CASCADE,
 "locationId" TEXT,modality TEXT NOT NULL DEFAULT 'unspecified',
 "patientName" TEXT NOT NULL DEFAULT '',"locationName" TEXT NOT NULL DEFAULT '',"locationAddress" TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL,at TIMESTAMPTZ(3) NOT NULL,notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'scheduled',alert BOOLEAN NOT NULL DEFAULT true,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 CONSTRAINT "ProfessionalAppointment_locationId_userId_fkey" FOREIGN KEY("locationId","userId") REFERENCES "ProfessionalLocation"(id,"userId") ON UPDATE CASCADE ON DELETE NO ACTION
);
CREATE INDEX IF NOT EXISTS "ProfessionalAppointment_userId_at_idx" ON "ProfessionalAppointment"("userId",at);
CREATE TABLE IF NOT EXISTS "ProfessionalFollowUpState" (
 "eventId" TEXT PRIMARY KEY REFERENCES "HealthEvent"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 at TIMESTAMPTZ(3) NOT NULL,status TEXT NOT NULL,"updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
DO $checks$
DECLARE ns text:=current_schema(); item record;
BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('ProfessionalLocationAvailability','ProfessionalLocationAvailability_range_check','weekday BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "startMinute" < "endMinute"'),
 ('ProfessionalAppointment','ProfessionalAppointment_status_check','status IN (''scheduled'',''completed'',''cancelled'')'),
 ('ProfessionalAppointment','ProfessionalAppointment_modality_check','modality IN (''clinic'',''online'',''home'',''unspecified'') AND ("locationId" IS NULL OR modality=''clinic'')'),
 ('ProfessionalFollowUpState','ProfessionalFollowUpState_status_check','status IN (''scheduled'',''completed'',''cancelled'')')
 ) AS v(tbl,nm,expr) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=format('%I.%I',ns,item.tbl)::regclass AND conname=item.nm) THEN
   EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I CHECK (%s)',ns,item.tbl,item.nm,item.expr);
  END IF;
 END LOOP;
END $checks$;
DO $copy$
DECLARE account record; place jsonb; slot jsonb; entry jsonb; override record; address jsonb; place_id text; linked_id text; owner_id text; is_new boolean;
BEGIN
 FOR account IN SELECT id,"accountData" FROM "User" LOOP
  FOR place IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(account."accountData"->'professionalLocations')='array' THEN account."accountData"->'professionalLocations' ELSE '[]'::jsonb END) LOOP
   place_id:=place->>'id';
   IF coalesce(place_id,'')='' OR coalesce(trim(place->>'name'),'')='' THEN RAISE EXCEPTION 'Invalid legacy professional location; migration stopped without discarding data'; END IF;
   SELECT "userId" INTO owner_id FROM "ProfessionalLocation" WHERE id=place_id;
   IF FOUND THEN
    IF owner_id<>account.id THEN RAISE EXCEPTION 'Legacy location ID collision'; END IF;
    CONTINUE;
   END IF;
   IF EXISTS(SELECT 1 FROM "Location" WHERE id=place_id) THEN RAISE EXCEPTION 'Location ID already exists outside professional directory'; END IF;
   address:=place->'fullAddress';
   INSERT INTO "Location"(id,name,"addressLine1","addressLine2",number,neighborhood,city,state,"postalCode",country,"formattedAddress","createdAt","updatedAt")
   VALUES(place_id,place->>'name',address->>'street',address->>'complement',address->>'number',address->>'neighborhood',address->>'city',address->>'state',address->>'postalCode',coalesce(nullif(address->>'country',''),'BR'),coalesce(place->>'address',''),now(),now());
   INSERT INTO "ProfessionalLocation"(id,"userId","normalizedName",active) VALUES(place_id,account.id,lower(trim(place->>'name')),coalesce((place->>'active')::boolean,true));
   FOR slot IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(place->'availability')='array' THEN place->'availability' ELSE '[]'::jsonb END) LOOP
    INSERT INTO "ProfessionalLocationAvailability"("locationId",weekday,"startMinute","endMinute") VALUES(place_id,(slot->>'weekday')::integer,split_part(slot->>'start',':',1)::integer*60+split_part(slot->>'start',':',2)::integer,split_part(slot->>'end',':',1)::integer*60+split_part(slot->>'end',':',2)::integer);
   END LOOP;
  END LOOP;
  FOR entry IN SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(account."accountData"->'professionalAgenda')='array' THEN account."accountData"->'professionalAgenda' ELSE '[]'::jsonb END) LOOP
   IF coalesce(entry->>'id','')='' THEN RAISE EXCEPTION 'Invalid legacy appointment'; END IF;
   SELECT "userId" INTO owner_id FROM "ProfessionalAppointment" WHERE id=entry->>'id';
   IF FOUND THEN IF owner_id<>account.id THEN RAISE EXCEPTION 'Legacy appointment ID collision'; END IF; CONTINUE; END IF;
   linked_id:=CASE WHEN entry->>'locationId' IN ('online','home','') THEN NULL ELSE entry->>'locationId' END;
   INSERT INTO "ProfessionalAppointment"(id,"userId","patientId","locationId",modality,"patientName","locationName","locationAddress",title,at,notes,status,alert,"updatedAt")
   VALUES(entry->>'id',account.id,nullif(entry->>'patientId',''),linked_id,CASE WHEN entry->>'locationId' IN ('online','home') THEN entry->>'locationId' WHEN linked_id IS NOT NULL THEN 'clinic' ELSE 'unspecified' END,coalesce(entry->>'patientName',''),coalesce(entry->>'locationName',''),coalesce(entry->>'locationAddress',''),entry->>'title',(entry->>'at')::timestamptz,coalesce(entry->>'notes',''),coalesce(entry->>'status','scheduled'),coalesce((entry->>'alert')::boolean,true),coalesce((entry->>'updatedAt')::timestamptz,now()));
  END LOOP;
  FOR override IN SELECT key,value FROM jsonb_each(CASE WHEN jsonb_typeof(account."accountData"->'professionalAgendaOverrides')='object' THEN account."accountData"->'professionalAgendaOverrides' ELSE '{}'::jsonb END) LOOP
   IF NOT EXISTS(SELECT 1 FROM "HealthEvent" WHERE id=override.key AND "authoredByUserId"=account.id) THEN RAISE EXCEPTION 'Legacy follow-up does not belong to the professional'; END IF;
   INSERT INTO "ProfessionalFollowUpState"("eventId",at,status) VALUES(override.key,(override.value->>'at')::timestamptz,override.value->>'status') ON CONFLICT("eventId") DO NOTHING;
  END LOOP;
 END LOOP;
 -- Preserve the original snapshots; only populate missing IDs for unambiguous
 -- matches within the author's private directory, never for home/online visits.
 UPDATE "HealthEvent" e SET "locationId"=p.id FROM "ProfessionalLocation" p JOIN "Location" l ON l.id=p.id
 WHERE e."authoredByUserId"=p."userId" AND e."locationId" IS NULL AND lower(trim(e."organizationNameSnapshot"))=p."normalizedName"
 AND e.payload->>'homeVisit' IS DISTINCT FROM 'true' AND e.payload->>'onlineVisit' IS DISTINCT FROM 'true';
END $copy$;
