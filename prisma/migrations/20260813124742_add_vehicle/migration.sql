-- Add the new relation column first, keep the old free-text column around until backfill completes.
ALTER TABLE "Trip" ADD COLUMN "vehicleId" TEXT;

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_companyId_idx" ON "Vehicle"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_companyId_plateNumber_key" ON "Vehicle"("companyId", "plateNumber");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_idx" ON "Trip"("vehicleId");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one Vehicle row per distinct existing (companyId, vehiclePlate) pair, then point trips at it.
INSERT INTO "Vehicle" ("id", "companyId", "plateNumber", "createdAt")
SELECT gen_random_uuid()::text, d."companyId", d."vehiclePlate", CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT "companyId", "vehiclePlate" FROM "Trip"
    WHERE "vehiclePlate" IS NOT NULL AND "vehiclePlate" != ''
) d;

UPDATE "Trip" t
SET "vehicleId" = v."id"
FROM "Vehicle" v
WHERE v."companyId" = t."companyId" AND v."plateNumber" = t."vehiclePlate";

-- Now safe to drop the old free-text column.
ALTER TABLE "Trip" DROP COLUMN "vehiclePlate";
