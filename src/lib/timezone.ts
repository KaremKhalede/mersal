/**
 * The business's single operating timezone — Arabia Standard Time, UTC+3, fixed year-round with
 * no DST (neither Saudi Arabia nor Yemen observe daylight saving). Every company on this platform
 * ships within this one corridor, so a single constant is the correct, simplest model — not a
 * per-company or per-user timezone setting, which would be complexity this business doesn't have.
 *
 * Any staff-entered wall-clock time (currently: TripStop.plannedArrival, via the New Trip dialog's
 * <input type="datetime-local">) must be interpreted as AST and converted to a true UTC instant
 * before it's stored — a bare `new Date(inputValue)` is wrong because it's parsed as local time
 * *to whatever timezone the server process happens to run in* (a real bug found in Phase 5 P1
 * batch 1: correct on a dev machine set to AST, silently 3 hours off once deployed to a UTC
 * server). Every read path that displays a stored instant back to a user must go through
 * `formatBusinessDateTime` for the same reason, in reverse.
 */
export const BUSINESS_TIMEZONE = "Asia/Riyadh"; // IANA zone for AST — Intl handles the UTC+3 math
const BUSINESS_UTC_OFFSET_MINUTES = 180;

/**
 * Converts a `datetime-local` input's raw value (e.g. "2026-06-01T09:30", no timezone of its own)
 * into the true UTC instant it represents, treating the entered wall-clock time as AST.
 */
export function businessLocalInputToDate(value: string): Date | undefined {
  if (!value) return undefined;
  // Parse the naive components as if they were UTC (the "Z" forces that, sidestepping the server
  // process's own ambient timezone entirely), then shift back by the fixed AST offset to land on
  // the actual UTC instant "09:30 AST" really is.
  const asIfUtc = new Date(`${value}:00Z`);
  if (Number.isNaN(asIfUtc.getTime())) return undefined;
  return new Date(asIfUtc.getTime() - BUSINESS_UTC_OFFSET_MINUTES * 60_000);
}

/**
 * Formats a stored UTC instant as AST wall-clock time — the same result for every viewer,
 * regardless of the server's or the viewer's own device timezone.
 *
 * Locale is "ar-SA-u-nu-latn", not bare "ar-SA": Arabic month names, but Latin digits. Bare ar-SA
 * resolves to numberingSystem "arab" and renders "١٨ أغسطس ٢٠٢٦", while every other number the app
 * prints — money (toLocaleString), carton counts, `tabular-nums` table columns, and the sibling
 * helpers below — is Latin. Mixing the two put "١٨/٨" next to "1,250 ر.ي" in the same table row.
 * One numbering system across the whole product; the digits, not the calendar, were the problem
 * (modern CLDR already resolves ar-SA to the Gregorian calendar).
 */
export function formatBusinessDateTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { timeZone: BUSINESS_TIMEZONE, ...opts }).format(date);
}

/**
 * Date + time in one string — the "when did this happen" stamp for tracking timelines, activity
 * feeds and log tables. Exists so those call sites stop reaching for a bare
 * `new Date(x).toLocaleString("ar-SA")`, which renders in the *viewer's* timezone (a customer
 * opening the public tracking page from outside AST saw times shifted by hours) and in a different
 * numbering system from the rest of the page.
 */
export function formatBusinessStamp(date: Date): string {
  return formatBusinessDateTime(date, {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * ---------------------------------------------------------------------------------------------
 * THE TWO DATE FORMATS THIS PRODUCT HAS
 * ---------------------------------------------------------------------------------------------
 *
 * Every date a user reads goes through `formatDate` or `formatDateStamp`. Nothing else.
 *
 * ## Why not a numeric date
 *
 * `Intl` renders Arabic numeric dates with U+200F (RIGHT-TO-LEFT MARK) around each separator:
 *
 *     day/month/year  ->  "21‏/8‏/2026"
 *
 * Those marks are strong-RTL characters. They break what would otherwise be one left-to-right
 * number run into three separate runs, and the surrounding RTL paragraph then lays those runs out
 * right-to-left — so the string *displays* as 2026/8/21. Day and year swap places on screen.
 *
 * This was live in thirteen places: the shipments and trips lists, the activity log, customer,
 * employee and vehicle detail, the trip page, the public tracking page, and the trip manifest a
 * driver signs. Not one of them carried an LTR island, and an LTR island would not have saved them
 * anyway — the marks are *inside* the string, so forcing the container to LTR renders "212026/8/"
 * instead. (Measured, not assumed: see the same fix on the invoice document.)
 *
 * A spelled month has no separators to reorder and no marks at all — `Intl` emits
 * "21 أغسطس 2026" clean. It is also simply better on a document: no reader has to work out
 * whether 8/9 means August or September.
 *
 * ## Why two, and only two
 *
 * The call sites had drifted to twelve different option objects — five of them numeric, i.e. five
 * different ways to be wrong. A date is either a day, or a moment. That is two functions.
 */

/** "21 أغسطس 2026". The date of something. */
export function formatDate(date: Date): string {
  return formatBusinessDateTime(date, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * "21 أغسطس 2026 · 10:40 ص". The moment something happened — timelines, logs, audit trails.
 *
 * Composed from the two clean formatters rather than asking Intl for both at once, which returns
 * "21 أغسطس 2026 في 10:40 ص" — a preposition that reads fine in a sentence and poorly in a table
 * cell. The separator is the same "·" the rest of the product uses to join facts on one line.
 */
export function formatDateStamp(date: Date): string {
  return `${formatDate(date)} · ${formatBusinessTime(date)}`;
}

/** Calendar date as YYYY-MM-DD in business time. Uses en-CA because "ar-SA" resolves to Arabic-Indic
 * digits — wrong for a stored Gregorian registration date. */
export function formatBusinessDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Clock time as h:mm with Latin digits, e.g. "10:30 ص". */
export function formatBusinessTime(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: BUSINESS_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
