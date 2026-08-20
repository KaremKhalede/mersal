import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ShipmentEvent, NotificationRecipient } from "@/lib/enums";
import { DEFAULT_TEMPLATES, META_TEMPLATES, EVENT_RECIPIENTS, renderTemplate } from "./templates";
import { notificationProvider } from "./provider";
import { normalizePhone } from "@/lib/phone";
import { trackingUrlFor } from "@/lib/tracking";

/** The company's own wording for this event if they wrote one and left it active, otherwise the
 *  shipped default. Shared so a retry renders exactly what a first attempt would render today. */
async function templateBody(companyId: string, event: ShipmentEvent) {
  const custom = await prisma.notificationTemplate.findUnique({
    where: { companyId_event_channel: { companyId, event, channel: "WHATSAPP" } },
  });
  return custom?.isActive ? custom.body : DEFAULT_TEMPLATES[event];
}

/**
 * One send attempt, reduced to the NotificationLog columns it produces. Both the first dispatch and
 * a manual retry route through this, so the two can never drift on what counts as skipped, what
 * counts as failed, or which template is used — the whole reason retry is not a second copy of the
 * dispatch code.
 *
 * Never throws: a provider that blows up is a FAILED row, not an exception for the caller to
 * handle. The caller owns the row and decides how to persist the result.
 */
async function attemptSend(params: {
  event: ShipmentEvent;
  recipient: NotificationRecipient;
  vars: Parameters<typeof renderTemplate>[1] & { recipientName: string };
  previewText: string;
  rawPhone: string;
  normalizedPhone: string | null;
  shipmentNumber: string;
}): Promise<{ status: string; providerError?: string | null; providerMessageId?: string | null }> {
  const { event, recipient, vars, previewText, rawPhone, normalizedPhone } = params;
  const metaTemplate = META_TEMPLATES[event];

  // Curation applies only to the real provider: Meta requires a pre-approved template per event,
  // and not every internal tracking event (loaded, ready-for-pickup, ...) is meant to reach the
  // customer at all. The mock provider keeps logging every event, unchanged, so tests/local dev
  // don't need real template names configured.
  if (process.env.WHATSAPP_PROVIDER === "meta" && !metaTemplate) {
    return { status: "SKIPPED", providerError: null };
  }

  // Meta templates are fixed, approved text: shipment_delivered asserts a completed handover and
  // has no slot for "minus one carton". Rather than add an eighth template or send a message that
  // contradicts the shipment record, a short delivery is skipped with a reason the office can act
  // on — the customer already had the partial-arrival message, and this one is a phone call.
  if (process.env.WHATSAPP_PROVIDER === "meta" && event === "SHIPMENT_DELIVERED" && Number(vars.missingCount ?? 0) > 0) {
    return { status: "SKIPPED", providerError: "delivered short — no approved template states a partial handover, contact the customer directly" };
  }

  if (!normalizedPhone) {
    // A missing/unusable receiver number is a routing gap, not a failure of this company's data
    // hygiene the way a bad customer number is: the customer's number is the account contact
    // every shipment is filed under and a bad one needs correcting, whereas the receiver is
    // whoever the sender named. So one is FAILED (fix this) and the other SKIPPED (nobody to
    // reach). Both surface on the same "needs attention" tab either way.
    return {
      status: recipient === "RECEIVER" ? "SKIPPED" : "FAILED",
      providerError: rawPhone
        ? `invalid or unrecognized phone number format for ${recipient.toLowerCase()}`
        : `no phone number on file for ${recipient.toLowerCase()}`,
    };
  }

  const message = metaTemplate
    ? { to: normalizedPhone, templateName: metaTemplate.name, languageCode: metaTemplate.language, params: metaTemplate.buildParams(vars as Parameters<typeof metaTemplate.buildParams>[0]), previewText }
    : { to: normalizedPhone, templateName: "", languageCode: "", params: [], previewText };

  let result: Awaited<ReturnType<typeof notificationProvider.send>>;
  try {
    result = await notificationProvider.send(message);
  } catch (err) {
    console.error(`[notifications] provider threw for ${event} on ${params.shipmentNumber}:`, err);
    result = { ok: false, error: err instanceof Error ? err.message : "unknown provider error", retryable: false };
  }

  return result.ok
    ? { status: "SENT", providerMessageId: result.providerMessageId, providerError: null }
    : { status: "FAILED", providerError: result.error };
}

/**
 * Called after the DB transaction that changed shipment state has already committed — a
 * notification failure (provider down, template bug, etc.) must never bubble up and make the
 * caller report the underlying business action as failed when it actually succeeded. Every
 * failure path here is caught and logged instead of thrown.
 *
 * `trackingEventId` is the id of the TrackingEvent row created by the same state transition that
 * triggered this dispatch (see transitionShipmentStatusTx) — a real transition creates exactly one,
 * state-machine-guarded, so it doubles as an idempotency key: a retried call for the same
 * underlying occurrence (Vercel function retry, duplicate webhook, etc.) hits NotificationLog's
 * unique(trackingEventId, recipient) constraint and is skipped here before ever calling the provider.
 *
 * One dispatch can address more than one party. EVENT_RECIPIENTS decides which — the sending
 * customer, the receiver at the destination, or (for TRIP_DEPARTED only) both. Each party gets its
 * own NotificationLog row, its own idempotency slot, and its own name in the template's greeting
 * slot; a failure to reach one never affects the other.
 */
export async function dispatchShipmentEvent(
  event: ShipmentEvent,
  shipmentId: string,
  trackingEventId?: string,
  extraVars: Record<string, string | number | undefined> = {}
) {
  try {
    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { company: true, currentBranch: true, customer: true },
    });

    // The link carries the unguessable tracking token, not the shipment number. WhatsApp is the
    // only channel that ever hands this token to the customer — that is what makes the tracking
    // page private (src/lib/tracking.ts).
    const trackingUrl = trackingUrlFor(shipment.trackingToken);
    const baseVars = {
      companyName: shipment.company.name,
      shipmentNumber: shipment.shipmentNumber,
      branchName: shipment.currentBranch?.name ?? "",
      totalCartons: shipment.totalCartons,
      arrivedCartons: shipment.arrivedCartons,
      trackingUrl,
      ...extraVars,
      // A delivery that handed over fewer cartons than were shipped must not be announced as a
      // clean one. The phrase is built here, next to the copy it lands in, rather than by every
      // caller — they only report how many cartons were missing.
      shortageNote: Number(extraVars.missingCount ?? 0) > 0 ? ` (نقص ${extraVars.missingCount} كرتون — يرجى التواصل معنا)` : "",
    };

    // The two humans a shipment has. Both are captured at intake and neither is optional in the
    // intake form — but a receiver number can still be unusable (typo, landline, foreign number),
    // which must degrade to a logged skip, never to a failed shipment operation.
    const parties: Record<NotificationRecipient, { name: string; rawPhone: string }> = {
      CUSTOMER: { name: shipment.customer.name, rawPhone: shipment.customer.phone },
      RECEIVER: { name: shipment.receiverName, rawPhone: shipment.receiverPhone },
    };

    const body = await templateBody(shipment.companyId, event);

    // Sending one person the same message twice because they are both sender and receiver is the
    // most common real case in this market (people ship goods to themselves, or collect them
    // personally). Resolved here, before anything is written or sent, and purely from the two
    // numbers — deliberately not from "did an earlier send in this loop succeed", which would make
    // the decision depend on provider outcome and let a retried dispatch reach a different verdict
    // and send the second message after all.
    const targets: { recipient: NotificationRecipient; name: string; rawPhone: string; normalizedPhone: string | null }[] = [];
    for (const recipient of EVENT_RECIPIENTS[event]) {
      const party = parties[recipient];
      const normalizedPhone = normalizePhone(party.rawPhone ?? "");
      if (normalizedPhone && targets.some((t) => t.normalizedPhone === normalizedPhone)) continue;
      targets.push({ recipient, name: party.name, rawPhone: party.rawPhone, normalizedPhone });
    }

    for (const { recipient, name, rawPhone, normalizedPhone } of targets) {
      const vars = { ...baseVars, recipientName: name };
      const previewText = renderTemplate(body, vars);

      // Claim the idempotency slot first — if another invocation (retry, duplicate webhook) already
      // claimed this exact trackingEventId for this recipient, the unique constraint rejects us
      // here, before any send.
      let logRow;
      try {
        logRow = await prisma.notificationLog.create({
          data: {
            companyId: shipment.companyId,
            shipmentId: shipment.id,
            event,
            channel: "WHATSAPP",
            recipient,
            toPhone: rawPhone || "",
            message: previewText,
            status: "PENDING",
            trackingEventId,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue; // already dispatched to this party
        throw err;
      }

      const outcome = await attemptSend({
        event,
        recipient,
        vars,
        previewText,
        rawPhone,
        normalizedPhone,
        shipmentNumber: shipment.shipmentNumber,
      });
      await prisma.notificationLog.update({ where: { id: logRow.id }, data: outcome });
    }
  } catch (err) {
    console.error(`[notifications] dispatch failed for ${event} on shipment ${shipmentId}:`, err);
  }
}

/**
 * Re-sends one notification that failed, in place.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE EXISTING ROW, NOT A NEW ONE
 * ---------------------------------------------------------------------------------------------
 * NotificationLog's idempotency key is unique(trackingEventId, recipient): one state transition
 * produces exactly one message per party, ever. Writing a second row for a retry would either
 * collide with that constraint or, worse, force it to be loosened — and a loosened key is what
 * lets a duplicate WhatsApp reach a customer. So a retry re-attempts the *same* row: same key,
 * same slot, one more send. The log stays "one row per message the system owes", with `status`
 * carrying the latest truth about it.
 *
 * The message itself is re-resolved from the shipment as it stands right now, not replayed from
 * the stored text: the reason a send failed is usually a number that has since been corrected, and
 * a retry that re-sent the old rendering to the old number would be theatre.
 *
 * Only FAILED rows are retryable. SENT is terminal by definition — re-sending it is the duplicate
 * this whole design exists to prevent. SKIPPED means the system decided there was nobody to reach
 * or nothing approved to send; that is a data or configuration fix, not a transient failure, and a
 * retry button on it would just fail again identically.
 */
export async function retryNotification(companyId: string, logId: string) {
  const log = await prisma.notificationLog.findUnique({ where: { id: logId } });
  if (!log || log.companyId !== companyId) throw new Error("الإشعار غير موجود");
  if (log.status === "SENT") throw new Error("تم إرسال هذا الإشعار بالفعل");
  if (log.status !== "FAILED") throw new Error("لا يمكن إعادة إرسال إشعار غير فاشل");
  if (!log.shipmentId) throw new Error("لا يمكن إعادة إرسال إشعار غير مرتبط بشحنة");

  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: log.shipmentId },
    include: { company: true, currentBranch: true, customer: true },
  });

  const recipient = log.recipient as NotificationRecipient;
  const party =
    recipient === "RECEIVER"
      ? { name: shipment.receiverName, rawPhone: shipment.receiverPhone }
      : { name: shipment.customer.name, rawPhone: shipment.customer.phone };
  const normalizedPhone = normalizePhone(party.rawPhone ?? "");

  // The sender and the receiver can be the same person — and if they are, the sibling row for this
  // same event already reached them. Re-sending here would be the one duplicate the initial
  // dispatch's de-duplication was written to avoid, arriving later by a different door.
  if (normalizedPhone) {
    const alreadyReached = await prisma.notificationLog.findFirst({
      where: { id: { not: log.id }, shipmentId: log.shipmentId, event: log.event, status: "SENT" },
      select: { toPhone: true },
    });
    if (alreadyReached && normalizePhone(alreadyReached.toPhone) === normalizedPhone) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "SKIPPED", providerError: "already delivered to this number for the same event" },
      });
      return { status: "SKIPPED" as const };
    }
  }

  // Claim the row before sending. Two employees hitting "إعادة الإرسال" on the same row at the same
  // moment would otherwise both read FAILED and both send — the same guarded-updateMany claim the
  // rest of this codebase uses for exactly this shape of race.
  const claim = await prisma.notificationLog.updateMany({
    where: { id: log.id, status: "FAILED" },
    data: { status: "PENDING" },
  });
  if (claim.count === 0) throw new Error("تتم إعادة إرسال هذا الإشعار حالياً");

  const event = log.event as ShipmentEvent;
  const vars = {
    companyName: shipment.company.name,
    shipmentNumber: shipment.shipmentNumber,
    branchName: shipment.currentBranch?.name ?? "",
    totalCartons: shipment.totalCartons,
    arrivedCartons: shipment.arrivedCartons,
    trackingUrl: trackingUrlFor(shipment.trackingToken),
    recipientName: party.name,
  };
  const previewText = renderTemplate(await templateBody(shipment.companyId, event), vars);

  const outcome = await attemptSend({
    event,
    recipient,
    vars,
    previewText,
    rawPhone: party.rawPhone,
    normalizedPhone,
    shipmentNumber: shipment.shipmentNumber,
  });

  // message/toPhone are refreshed too: after a corrected phone number, a row still showing the old
  // one would misreport where the message actually went.
  await prisma.notificationLog.update({
    where: { id: log.id },
    data: { ...outcome, message: previewText, toPhone: party.rawPhone || "" },
  });

  return { status: outcome.status };
}
