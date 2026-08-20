-- Human-facing document numbers move from "random 5 digits, retried until unique" to database
-- sequences. See src/lib/ids.ts for the full reasoning; in short the old scheme had a hard ceiling
-- of 89,999 values per prefix and started failing outright well before reaching it.
--
-- No table or column changes: shipmentNumber / tripNumber / invoiceNumber stay TEXT UNIQUE and the
-- primary keys stay cuid. This migration only adds the allocators.

-- START 100000 keeps every generated value clear of the legacy 5-digit range (10000-99999), so old
-- and new numbers can coexist without a backfill and existing references keep working untouched.
CREATE SEQUENCE IF NOT EXISTS shipment_number_seq AS bigint START WITH 100000 MINVALUE 100000;
CREATE SEQUENCE IF NOT EXISTS trip_number_seq     AS bigint START WITH 100000 MINVALUE 100000;
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq  AS bigint START WITH 100000 MINVALUE 100000;

-- Defensive: if a database already contains numbers at or above the start (e.g. seeded demo data
-- from a previous format), advance each sequence past them so the first allocation cannot collide
-- with a row that is already there. `false` as the third argument means "the NEXT nextval returns
-- exactly this value". Only plain PREFIX-<digits> values are considered; anything else (test
-- fixtures like SH-1787043901228-4) cannot collide with a generated number by construction.
SELECT setval(
  'shipment_number_seq',
  GREATEST(100000, COALESCE((
    SELECT MAX(substring("shipmentNumber" from 4)::bigint) + 1
    FROM "Shipment" WHERE "shipmentNumber" ~ '^SH-[0-9]+$'
  ), 0)),
  false
);

SELECT setval(
  'trip_number_seq',
  GREATEST(100000, COALESCE((
    SELECT MAX(substring("tripNumber" from 4)::bigint) + 1
    FROM "Trip" WHERE "tripNumber" ~ '^TR-[0-9]+$'
  ), 0)),
  false
);

SELECT setval(
  'invoice_number_seq',
  GREATEST(100000, COALESCE((
    SELECT MAX(substring("invoiceNumber" from 5)::bigint) + 1
    FROM "Invoice" WHERE "invoiceNumber" ~ '^INV-[0-9]+$'
  ), 0)),
  false
);
