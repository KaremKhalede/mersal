/**
 * CSV cell encoding for every export in the app.
 *
 * Two separate jobs, which is why the five hand-written copies this replaces were each only doing
 * half of it:
 *
 * 1. RFC-4180 quoting, so a value containing a comma, a quote or a newline doesn't shift every
 *    column after it. That part the old copies did.
 *
 * 2. Formula-injection defence, which none of them did. Excel, LibreOffice and Google Sheets all
 *    treat a cell beginning with `=`, `+`, `-`, `@`, or a leading tab/carriage-return as a formula
 *    to execute on open. Company names, customer names and receiver names in these exports are
 *    free text typed by users, so `=HYPERLINK(...)` or a `=cmd|...` DDE payload in a customer name
 *    becomes live content in whoever opens the file — an attack that lands on the platform operator
 *    reconciling payments, not on the tenant who typed it.
 *
 *    The fix is a leading apostrophe, which spreadsheets consume as "treat the rest as text". It is
 *    applied only to values that actually start with a dangerous character, so ordinary Arabic
 *    names and numbers are untouched — and a negative number like "-250" keeps displaying as
 *    "-250" rather than being mangled into something unreadable.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvEscape(value: string): string {
  const guarded = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Header row + data rows -> a CSV document. */
export function toCsv(header: string[], rows: string[][]): string {
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}
