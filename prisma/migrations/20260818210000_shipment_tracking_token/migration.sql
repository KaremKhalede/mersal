-- Public tracking credential for /track/<token>.
--
-- Added in three steps rather than one NOT NULL column: existing rows need a value before the
-- constraint can be enforced, and every value has to be distinct for the unique index to build.
ALTER TABLE "Shipment" ADD COLUMN "trackingToken" TEXT;

-- Backfill. md5() over the row's own id plus clock_timestamp() is unique per row by construction
-- (id is already a unique cuid), which is all this needs — these are pre-existing demo/dev rows,
-- and every row created from now on gets a crypto.randomBytes token from src/lib/tracking.ts.
UPDATE "Shipment"
SET "trackingToken" = md5("id" || clock_timestamp()::text || random()::text)
WHERE "trackingToken" IS NULL;

ALTER TABLE "Shipment" ALTER COLUMN "trackingToken" SET NOT NULL;
CREATE UNIQUE INDEX "Shipment_trackingToken_key" ON "Shipment"("trackingToken");
