import { randomBytes } from "node:crypto";
import { absoluteUrl } from "@/lib/app-url";

/**
 * Public tracking credentials for /track/<token>.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------------
 * The tracking page used to be keyed by `Shipment.shipmentNumber` — a short "SH-#####" label with
 * fewer than 90,000 possible values. That made it enumerable, and because the public
 * pickup/delivery actions authorized on nothing but "you knew the number", anyone who guessed a
 * number for an arrived shipment could redirect real cartons to an address of their choosing.
 *
 * The fix separates the two jobs that string was doing:
 *   - shipmentNumber stays the human label: printed on labels, read out over the phone, searched
 *     for in the office. Public, short, not a secret, and no longer grants anything.
 *   - trackingToken is the credential: 128 bits of crypto randomness, only ever delivered to the
 *     customer through their own WhatsApp message.
 *
 * ---------------------------------------------------------------------------------------------
 * READ vs WRITE — the rule this module encodes
 * ---------------------------------------------------------------------------------------------
 * READ (open the page, see status/timeline/ETA): token alone. Zero friction — the customer taps
 * the WhatsApp link and everything is there. No login, no code, nothing to type.
 *
 * WRITE (choose branch pickup, request home delivery): token AND the last 4 digits of the
 * shipment's receiverPhone.
 *
 * Why both, and not either alone:
 *   - Last 4 digits alone is only 10,000 combinations and is not secret from anyone who knows the
 *     receiver. Useless as a primary credential.
 *   - The token alone is unguessable, but a tracking link is a WhatsApp message: it gets forwarded
 *     to family groups, screenshotted, and left on shared phones. Possession of the link should
 *     prove you can *see* the shipment, not that you may *redirect* it.
 *   - Together they are possession (the link) plus knowledge (the receiver's own number) — the same
 *     shape couriers use when they ask for a postal code before accepting a redelivery change.
 *
 * The friction is deliberately paid only on the two actions that move goods, and it is information
 * the real receiver knows by heart.
 */

/** 128 bits, URL-safe, 22 characters — e.g. "N2s8xQ1vKpL0aZ3rT7wYbA". */
export function newTrackingToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Absolute tracking URL for outbound messages — see src/lib/app-url.ts for why APP_URL is not
 *  allowed to be missing in production. */
export function trackingUrlFor(token: string): string {
  // "/t/" not "/track/": the branded lookup owns /track/<company>, and this URL spends its whole
  // life inside a WhatsApp message where every character shows.
  return absoluteUrl(`/t/${token}`);
}

/**
 * True when `input` matches the last 4 digits of `phone`.
 *
 * Both sides are reduced to digits first: stored numbers are E.164 ("+966501234567") while a
 * customer on a phone keyboard may type "4567", " 4567 ", or Arabic-Indic "٤٥٦٧". Comparing raw
 * strings would reject correct answers and push people toward guessing.
 *
 * Fails closed: a phone with fewer than 4 digits on file can never be satisfied, rather than
 * matching everything.
 */
export function matchesPhoneLast4(phone: string | null | undefined, input: string | null | undefined): boolean {
  if (!phone || !input) return false;
  const normalizeDigits = (v: string) =>
    v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/\D/g, "");
  const phoneDigits = normalizeDigits(phone);
  const given = normalizeDigits(input);
  if (phoneDigits.length < 4 || given.length !== 4) return false;
  return phoneDigits.slice(-4) === given;
}
