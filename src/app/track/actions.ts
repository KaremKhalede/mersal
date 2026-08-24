"use server";

import { findShipmentByPublicNumber } from "@/modules/shipments/service";
import { matchesPhoneLast4 } from "@/lib/tracking";
import { checkRateLimit } from "@/lib/rate-limit";
import { toTrackedView, type TrackedShipment } from "./tracked-shipment";
import { carrierFromCompany, type PublicCarrier } from "./tenant";

/**
 * ============================================================================================
 * PUBLIC SHIPMENT LOOKUP — read only, by construction.
 * ============================================================================================
 *
 * The problem it solves: the tracking link only ever reaches the customer through one WhatsApp
 * message. Delete it, change phone, or let a relative collect on your behalf, and there was no way
 * back into your own shipment — the bare domain served a staff login screen. The recovery path was
 * a phone call to the office, which is the call this whole product exists to prevent.
 *
 * ============================================================================================
 * WHY THIS DOES NOT HAND BACK THE TRACKING TOKEN
 * ============================================================================================
 *
 * The obvious design — "enter your number and the receiver's last 4 digits, we redirect you to
 * /track/<token>" — quietly rebuilds the exact hole src/lib/tracking.ts was written to close.
 *
 * Walk the numbers:
 *   - `shipmentNumber` comes from a Postgres sequence, so SH-100001, SH-100002, ... are all valid
 *     guesses. src/lib/ids.ts accepts that openly, on the stated grounds that the number grants
 *     nothing.
 *   - The last 4 digits are 10,000 combinations, and tracking.ts already records that they are
 *     "not secret from anyone who knows the receiver".
 *   - The tracking token plus those same 4 digits authorizes `publicRequestDeliveryAction`, which
 *     sends real cartons to an address the caller types in.
 *
 * So handing the token back would make a sequential number plus a 10,000-space guess sufficient to
 * redirect somebody else's goods. Rate limiting is not an adequate answer either: `checkRateLimit`
 * fails OPEN when Redis is unconfigured or unreachable (see src/lib/rate-limit.ts — a deliberate
 * choice, since it is defense-in-depth rather than a correctness boundary). A control that
 * disappears during an outage must never be the only thing standing between a stranger and a
 * truckload.
 *
 * The split this file implements instead:
 *
 *   READ  (status, ETA, cartons, timeline, where to collect)  ->  lookup is enough
 *   WRITE (choose pickup, request home delivery)              ->  still the token, and only the
 *                                                                 token, delivered by WhatsApp
 *
 * A successful lookup therefore returns a `TrackedShipment` view model that contains no token, and
 * the page renders the tracking card with its action controls omitted. What an attacker gains by
 * brute-forcing is a read of one shipment — precisely what a forwarded WhatsApp link already gives
 * away — and no capability at all. Nothing about the cargo-redirect surface changes.
 *
 * Rate limiting is still applied, as the second layer it is meant to be.
 *
 * ============================================================================================
 * WHY THE FAILURE MESSAGE IS THE SAME FOR "NO SUCH SHIPMENT" AND "WRONG DIGITS"
 * ============================================================================================
 *
 * Splitting them would make this an oracle for which sequential numbers are real — free
 * reconnaissance on how much every company on the platform ships, and a way to narrow brute-force
 * targets to numbers that exist. The same reasoning, and the same wording, as `authorize()` in the
 * token route's actions.
 *
 * Genuine input mistakes still get a specific message, because those are checked on FORM SHAPE
 * before any database read and leak nothing: an empty field, or last-4 that is not four digits.
 * That is the useful half of "diagnostic errors" without the half that helps an attacker.
 */

/**
 * A successful lookup returns the carrier alongside the shipment.
 *
 * The unbranded /track door does not know whose shipment it is until the number resolves — that is
 * the whole reason the form exists — so the carrier has to travel back with the result for the card
 * to be dressed correctly. On the branded door the carrier is already known from the slug, and the
 * one returned here is checked against it rather than trusted.
 */
export type LookupResult = { shipment: TrackedShipment; carrier: PublicCarrier } | { error: string };

const GENERIC_DENIAL =
  "لم نجد شحنة بهذه البيانات. تأكد من رقم الشحنة ومن آخر 4 أرقام لجوال المستلم كما هي مسجّلة لدى الشركة.";

/** Same digit-normalisation the last-4 check uses, so an Arabic-Indic keyboard is not rejected by
 *  a shape check that the comparison itself would have accepted. */
function digitCount(value: string): number {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "").length;
}

export async function lookupShipmentAction(formData: FormData): Promise<LookupResult> {
  const shipmentNumber = String(formData.get("shipmentNumber") || "").trim();
  const last4 = String(formData.get("last4") || "").trim();
  /**
   * Set by the branded door (/track/<company>), absent on the unbranded fallback.
   *
   * When present it is a TENANT FENCE, not a hint: a shipment belonging to another carrier is
   * refused here even though the number is globally unique and the digits matched. Company A's
   * page must never render company B's shipment — a customer would be shown the wrong carrier's
   * branding around a real shipment, and company A would be handed a look at company B's book one
   * number at a time.
   *
   * The refusal is the same generic message as every other failure. Distinguishing "wrong carrier"
   * from "no such shipment" would turn the branded page into an oracle for which numbers belong to
   * which tenant.
   */
  const companySlug = String(formData.get("companySlug") || "").trim().toLowerCase();

  // ---- shape checks: specific, and they touch no data ----
  if (!shipmentNumber) return { error: "أدخل رقم الشحنة كما هو مكتوب على الإيصال." };
  if (shipmentNumber.length > 40) return { error: "رقم الشحنة غير صحيح." };
  if (!last4) return { error: "أدخل آخر 4 أرقام من جوال المستلم." };
  if (digitCount(last4) !== 4) return { error: "آخر 4 أرقام يجب أن تكون أربعة أرقام بالضبط." };

  // Keyed by the shipment number, not the IP: an attacker spread across many addresses still
  // cannot walk one shipment's 10,000-combination space, and a whole office behind one NAT does
  // not lock each other out. Mirrors the per-token budget the write path already uses.
  const withinLimit = await checkRateLimit(`track-lookup:${shipmentNumber.toUpperCase()}`, {
    max: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!withinLimit) return { error: "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى." };

  const found = await findShipmentByPublicNumber(shipmentNumber);
  // Every branch below, one message — see the header.
  if (!found) return { error: GENERIC_DENIAL };
  if (!matchesPhoneLast4(found.receiverPhone, last4)) return { error: GENERIC_DENIAL };
  if (companySlug && found.shipment.company.slug !== companySlug) return { error: GENERIC_DENIAL };
  // A carrier the platform has switched off stops serving its branded page, and stops resolving
  // through it — matching what resolvePublicCarrier does for the page itself.
  if (found.shipment.company.status !== "ACTIVE") return { error: GENERIC_DENIAL };

  // toTrackedView has no `trackingToken` field to populate, so the credential cannot reach the
  // client even by accident here.
  return { shipment: toTrackedView(found.shipment), carrier: carrierFromCompany(found.shipment.company) };
}
