-- Support contact shown on the public tracking page (/track).
--
-- Four nullable columns on the single-row Platform table. Nullable and not backfilled: an operator
-- who has not entered them gets no contact band at all, which is the honest state. A default of ''
-- would render an empty row on a customer-facing page instead of being skipped.
--
-- On Platform rather than Company because /track is reached BEFORE any carrier is known — the
-- customer types a shipment number precisely because they cannot tell you whose shipment it is.
ALTER TABLE "Platform" ADD COLUMN "supportPhone" TEXT;
ALTER TABLE "Platform" ADD COLUMN "supportWhatsapp" TEXT;
ALTER TABLE "Platform" ADD COLUMN "supportEmail" TEXT;
ALTER TABLE "Platform" ADD COLUMN "supportHours" TEXT;
