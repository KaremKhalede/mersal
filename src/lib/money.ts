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

/** The currency symbol, in one place. Never inline "ر.ي" — see formatYER. */
export const YER = "ر.ي";

/**
 * The one way money reaches a screen.
 *
 * 53 places wrote the amount and the "ر.ي" by hand, and they disagreed on the part that matters:
 * 37 called `toLocaleString()` with no locale and 16 passed "en-US". A bare `toLocaleString()`
 * follows the *runtime's* locale, so on a server resolving to ar-* it renders Arabic-Indic digits
 * — "١٢٬٥٠٠ ر.ي" sitting in the same table row as a sibling's "12,500 ر.ي". Same bug the date
 * helpers already solved by pinning "ar-SA-u-nu-latn" (see lib/timezone.ts); money never got it.
 *
 * Two forms, and the difference is padding, not precision:
 *
 *   default   grouped, fractions shown only when the amount has them — 12500 -> "12,500",
 *             33.3 -> "33.3". Operational screens, where whole riyals are the norm.
 *   `2`       always two decimals — "187,800.00". The accounting form on the platform billing
 *             screens, where a per-carton fee is genuinely fractional and columns must align.
 *
 * The default must NOT clamp maximumFractionDigits to 0: a shipping price of 33.3 would print as
 * "33" while the database, the remaining-balance arithmetic and the Decimal round-trip all still
 * say 33.3 — the screen would quietly disagree with the ledger. (Caught by
 * scenario-s-finance-dashboard, which exists for exactly this.)
 */
export function formatYER(value: number, decimals: 0 | 2 = 0): string {
  return `${formatAmount(value, decimals)} ${YER}`;
}

/** The number alone, same rules — for cells whose column header already says "(ر.ي)". */
export function formatAmount(value: number, decimals: 0 | 2 = 0): string {
  return value.toLocaleString("en-US", {
    // `decimals` sets the floor (pad to two, or don't pad at all); the ceiling is always two, so
    // a fractional amount is never silently rounded off the screen.
    minimumFractionDigits: decimals,
    maximumFractionDigits: 2,
  });
}
