export const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function monthLabel(d: Date) {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthValue(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Last 12 months, newest first — the window the ledger realistically gets queried over. */
export function monthOptions(now: Date = new Date()) {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: monthValue(d), label: monthLabel(d) };
  });
}

/** `YYYY-MM` -> first day of that month; falls back when the param is absent or malformed. */
export function parseMonth(raw: string | undefined, fallback: Date) {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? "");
  if (!m) return fallback;
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return fallback;
  return new Date(Number(m[1]), month, 1);
}
