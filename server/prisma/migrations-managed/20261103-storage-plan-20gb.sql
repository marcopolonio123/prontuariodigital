ALTER TABLE "StorageCart" DROP CONSTRAINT IF EXISTS "StorageCart_gb_check";
ALTER TABLE "StorageCart" ADD CONSTRAINT "StorageCart_gb_check" CHECK (gb IN (5,10,20));
