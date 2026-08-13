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

/** Formats a stored UTC instant as AST wall-clock time — the same result for every viewer,
 * regardless of the server's or the viewer's own device timezone. */
export function formatBusinessDateTime(date: Date, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat("ar-SA", { timeZone: BUSINESS_TIMEZONE, ...opts }).format(date);
}
