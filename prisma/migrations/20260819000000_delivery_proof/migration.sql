-- Proof of delivery. Until now a handover recorded only that the shipment reached DELIVERED, with
-- no record of who actually took the cartons — leaving a "I never received it" dispute with nothing
-- to answer it.
--
-- Purely additive and all-nullable: existing DELIVERED shipments keep their status and simply carry
-- no proof, which is the truth about them. Nothing is backfilled, because there is nothing to
-- backfill from — inventing a receiver name for a past handover would be fabricating evidence.
ALTER TABLE "Shipment" ADD COLUMN "deliveredToName" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "deliveredToLast4" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN "deliveryChannel" TEXT;
ALTER TABLE "Shipment" ADD COLUMN "deliveryNote" TEXT;
