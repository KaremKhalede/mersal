"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requestDeliveryFromCustomer } from "@/modules/delivery/service";
import { matchesPhoneLast4 } from "@/lib/tracking";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Public, unauthenticated write actions for the customer tracking page.
 *
 * Every one of these can change where physical cartons end up, so each re-derives the shipment
 * from the tracking token on the server and re-checks the last-4 answer. Nothing is trusted from
 * the client: not the shipment id, not the company, not a previous verification. There is no
 * "verified" cookie or session to steal or replay — proof is presented per action.
 *
 * See src/lib/tracking.ts for why the rule is token (possession) + last 4 digits (knowledge).
 */

type PublicResult = { error?: string };

const GENERIC_DENIAL = "تعذّر التحقق. تأكد من آخر 4 أرقام من جوال المستلم.";

/**
 * Resolves the shipment behind a token and checks the caller knows the receiver's number.
 *
 * Returns the same message whether the token was wrong, the shipment doesn't exist, or the digits
 * were wrong: distinguishing them would turn this into an oracle that confirms which tokens are
 * real. Rate-limited per token so the 10,000-combination last-4 space can't be walked.
 */
async function authorize(token: string, last4: string): Promise<{ shipment: { id: string; status: string } } | { error: string }> {
  // Keyed by token, not IP: an attacker on many IPs still cannot brute-force one shipment, and a
  // shared office IP doesn't lock out unrelated customers.
  const withinLimit = await checkRateLimit(`track-verify:${token}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!withinLimit) return { error: "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى." };

  const shipment = await prisma.shipment.findUnique({
    where: { trackingToken: token },
    select: { id: true, status: true, receiverPhone: true },
  });
  if (!shipment) return { error: GENERIC_DENIAL };
  if (!matchesPhoneLast4(shipment.receiverPhone, last4)) return { error: GENERIC_DENIAL };

  return { shipment: { id: shipment.id, status: shipment.status } };
}

/**
 * Only a shipment whose cartons are actually sitting in the destination branch can still have its
 * handover method chosen. PARTIALLY_ARRIVED counts: since P0-4 a shipment that arrived short is a
 * normal, collectable shipment — the cartons that did arrive are on the shelf, and the customer was
 * told exactly which one is missing. Leaving it out meant the office could hand the shipment over
 * while the customer's own page refused every choice with a generic "not at this stage".
 *
 * This widens *what stage* may act, never *who* may act: the credential is unchanged (the token
 * opens the page, the receiver's last 4 digits authorize the write) and both are still checked per
 * action in authorize() above.
 */
const CHOOSABLE_STATUSES = ["ARRIVED", "PARTIALLY_ARRIVED", "READY_FOR_PICKUP"];

function assertChoosable(status: string): string | null {
  return CHOOSABLE_STATUSES.includes(status) ? null : "لا يمكن تغيير طريقة الاستلام في هذه المرحلة";
}

export async function publicRequestDeliveryAction(token: string, formData: FormData): Promise<PublicResult> {
  const auth = await authorize(token, String(formData.get("last4") || ""));
  if ("error" in auth) return auth;

  const stageError = assertChoosable(auth.shipment.status);
  if (stageError) return { error: stageError };

  const destinationAddress = String(formData.get("destinationAddress") || "").trim();
  if (destinationAddress.length < 5) return { error: "أدخل عنوان التوصيل" };

  // Creates a PENDING request only — the branch confirms before anything is dispatched.
  await requestDeliveryFromCustomer({
    shipmentId: auth.shipment.id,
    destinationAddress,
    notes: String(formData.get("notes") || "").trim() || undefined,
  });

  revalidatePath(`/track/${token}`);
  return {};
}

export async function publicChoosePickupAction(token: string, formData: FormData): Promise<PublicResult> {
  const auth = await authorize(token, String(formData.get("last4") || ""));
  if ("error" in auth) return auth;

  const stageError = assertChoosable(auth.shipment.status);
  if (stageError) return { error: stageError };

  // Scoped by id resolved from the token above — never by anything the client sent.
  await prisma.shipment.update({ where: { id: auth.shipment.id }, data: { deliveryMethod: "PICKUP" } });

  revalidatePath(`/track/${token}`);
  return {};
}
