import { prisma } from "@/lib/db";

/**
 * Human-facing document numbers: SH-100001, TR-100001, INV-100001.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A DATABASE SEQUENCE
 * ---------------------------------------------------------------------------------------------
 * These used to be "PREFIX-" plus a random 5-digit number, retried up to 20 times against a
 * uniqueness check. That had three separate failure modes, all of which got worse as the platform
 * grew:
 *
 *   1. A hard ceiling. Five digits is 89,999 values per prefix, GLOBALLY (not per company). At
 *      ~600k shipments a year across a few dozen offices the space is exhausted inside the first
 *      year, after which no shipment can be created at all.
 *   2. Failure long before that ceiling. With N numbers taken, one attempt collides with
 *      probability N/89,999; at 80k rows all 20 attempts fail roughly 10% of the time, so about one
 *      shipment in ten is simply rejected — while the system still looks "half full".
 *   3. It cost a database round-trip per attempt and still guaranteed nothing.
 *
 * A Postgres sequence removes all three at once: nextval() is atomic, never collides, needs no
 * read-then-check, and counts to 2^63. It is deliberately non-transactional — a rolled-back
 * transaction burns its number rather than holding a lock — so concurrent shipment creation never
 * serializes on number allocation. Gaps are normal and carry no meaning.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS NOT
 * ---------------------------------------------------------------------------------------------
 * Not the primary key: every model still keys on its own cuid `id`, and nothing joins on these
 * strings. Not a credential either — that is what Shipment.trackingToken is for (src/lib/tracking.ts).
 * Because security no longer rests on these being unguessable, they are free to be short, ordered
 * and readable, which is what an employee reading one down the phone actually needs.
 *
 * The sequences start at 100000 so a generated number can never equal one of the legacy 5-digit
 * values (10000-99999) still present in older data.
 *
 * Trade-off accepted: sequential numbers disclose roughly how many shipments the platform has
 * handled. That is platform-wide, never per-company, it is what every courier's own numbering
 * already reveals, and it buys a number a human can read aloud.
 */

/** The subset of a Prisma client this module needs, so prisma/seed.ts can pass its own instance
 *  instead of importing the app's shared singleton and opening a second connection. */
type SequenceClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};

const SEQUENCES = {
  shipment: { prefix: "SH", sequence: "shipment_number_seq" },
  trip: { prefix: "TR", sequence: "trip_number_seq" },
  invoice: { prefix: "INV", sequence: "invoice_number_seq" },
} as const;

export type PublicNumberKind = keyof typeof SEQUENCES;

/**
 * Allocates the next number for `kind`. The sequence name is passed as a bound parameter cast to
 * regclass rather than interpolated into the SQL text — the names are internal constants, but
 * building raw SQL by string concatenation is a habit worth not having.
 */
export async function nextPublicNumber(kind: PublicNumberKind, db: SequenceClient = prisma): Promise<string> {
  const { prefix, sequence } = SEQUENCES[kind];
  const rows = await db.$queryRaw<{ value: bigint }[]>`SELECT nextval(${sequence}::regclass) AS value`;
  const value = rows[0]?.value;
  if (value === undefined) throw new Error(`تعذّر توليد رقم (${kind})`);
  return `${prefix}-${value}`;
}

export const nextShipmentNumber = (db?: SequenceClient) => nextPublicNumber("shipment", db);
export const nextTripNumber = (db?: SequenceClient) => nextPublicNumber("trip", db);
export const nextInvoiceNumber = (db?: SequenceClient) => nextPublicNumber("invoice", db);
