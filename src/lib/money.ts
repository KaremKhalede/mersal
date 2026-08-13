import type { Prisma } from "@prisma/client";

/**
 * Prisma.Decimal instances can't cross the Server->Client Component boundary (not plain-object
 * serializable) and have no .toLocaleString()/arithmetic operators — every money field must be
 * converted to a plain number at the point it leaves the database layer, before it reaches any
 * page or component. Exact at these magnitudes: Decimal.toNumber() only loses precision past
 * ~15-17 significant digits, far beyond any real shipping price or platform fee.
 */
export function toMoney(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

export function toMoneyOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}
