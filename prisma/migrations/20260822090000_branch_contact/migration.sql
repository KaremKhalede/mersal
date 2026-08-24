-- A branch's own phone number and street address.
--
-- Two nullable columns on Branch rather than a Contact/Location side table: a branch has exactly
-- one of each, they are read on every screen that already loads the branch, and they are never
-- queried independently of it. A side table would add a join to the tracking page — the one screen
-- in this product with no session and the tightest reason to stay a single read.
--
-- Nullable and NOT backfilled on purpose. Every existing row keeps NULL, which is the honest state
-- ("we do not know this branch's number"), and every consumer falls back to Company.phone. A
-- default of '' would be worse than NULL: it renders as an empty line on a customer-facing page
-- instead of being skipped.
ALTER TABLE "Branch" ADD COLUMN "phone" TEXT;
ALTER TABLE "Branch" ADD COLUMN "address" TEXT;
