/**
 * Normalizes a customer-entered phone number to E.164 for WhatsApp (which requires E.164, no
 * spaces/dashes, no leading 0). Scoped to this platform's actual market — Yemen and Saudi Arabia —
 * rather than a general-purpose international parser, since a wrong guess here means a real WhatsApp
 * message either never arrives or goes to the wrong person.
 *
 * Yemen mobile: +967 7X XXXXXXX (mobile prefixes start with 7 — 70/71/73/77/78).
 * Saudi mobile: +966 5X XXXXXXX (mobile prefixes start with 5).
 * Both have a 9-digit subscriber number after the country code, so a bare local number's leading
 * digit (7 vs 5) unambiguously identifies the country once the country code itself is absent.
 *
 * Returns null (never throws) for anything that doesn't confidently match — callers must treat
 * that as "cannot notify this customer," not crash the caller's transaction.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");

  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith("+")) digits = digits.startsWith("0") ? digits.slice(1) : digits;

  const tryCountry = (countryCode: string, mobilePrefixPattern: RegExp, local: string) =>
    mobilePrefixPattern.test(local) && local.length === 9 ? `+${countryCode}${local}` : null;

  if (digits.startsWith("+967")) return tryCountry("967", /^7[01378]/, digits.slice(4));
  if (digits.startsWith("+966")) return tryCountry("966", /^5[0-9]/, digits.slice(4));
  if (digits.startsWith("+")) return null; // some other country code — out of scope for this market

  // No country code at all — infer from the local mobile prefix.
  return tryCountry("967", /^7[01378]/, digits) ?? tryCountry("966", /^5[0-9]/, digits);
}
