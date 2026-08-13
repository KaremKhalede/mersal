import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ShipmentEvent } from "@/lib/enums";
import { DEFAULT_TEMPLATES, META_TEMPLATES, renderTemplate } from "./templates";
import { notificationProvider } from "./provider";
import { normalizePhone } from "@/lib/phone";

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
 * unique(trackingEventId) constraint and is skipped here before ever calling the provider.
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

    const trackingUrl = `${process.env.APP_URL ?? ""}/track/${shipment.shipmentNumber}`;
    const vars = {
      companyName: shipment.company.name,
      customerName: shipment.customer.name,
      shipmentNumber: shipment.shipmentNumber,
      branchName: shipment.currentBranch?.name ?? "",
      totalCartons: shipment.totalCartons,
      arrivedCartons: shipment.arrivedCartons,
      trackingUrl,
      ...extraVars,
    };

    const customTemplate = await prisma.notificationTemplate.findUnique({
      where: { companyId_event_channel: { companyId: shipment.companyId, event, channel: "WHATSAPP" } },
    });
    const previewBody = customTemplate?.isActive ? customTemplate.body : DEFAULT_TEMPLATES[event];
    const previewText = renderTemplate(previewBody, vars);

    // Claim the idempotency slot first — if another invocation (retry, duplicate webhook) already
    // claimed this exact trackingEventId, its unique constraint rejects us here, before any send.
    let logRow;
    try {
      logRow = await prisma.notificationLog.create({
        data: {
          companyId: shipment.companyId,
          shipmentId: shipment.id,
          event,
          channel: "WHATSAPP",
          toPhone: shipment.customer.phone,
          message: previewText,
          status: "PENDING",
          trackingEventId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // already dispatched
      throw err;
    }

    const usingRealProvider = process.env.WHATSAPP_PROVIDER === "meta";
    const metaTemplate = META_TEMPLATES[event];

    // Curation applies only to the real provider: Meta requires a pre-approved template per event,
    // and not every internal tracking event (loaded, ready-for-pickup, ...) is meant to reach the
    // customer at all. The mock provider keeps logging every event, unchanged, so tests/local dev
    // don't need real template names configured.
    if (usingRealProvider && !metaTemplate) {
      await prisma.notificationLog.update({ where: { id: logRow.id }, data: { status: "SKIPPED" } });
      return;
    }

    const normalizedPhone = normalizePhone(shipment.customer.phone);
    if (!normalizedPhone) {
      await prisma.notificationLog.update({
        where: { id: logRow.id },
        data: { status: "FAILED", providerError: "invalid or unrecognized phone number format" },
      });
      return;
    }

    const message = metaTemplate
      ? { to: normalizedPhone, templateName: metaTemplate.name, languageCode: metaTemplate.language, params: metaTemplate.buildParams(vars), previewText }
      : { to: normalizedPhone, templateName: "", languageCode: "", params: [], previewText };

    let result: Awaited<ReturnType<typeof notificationProvider.send>>;
    try {
      result = await notificationProvider.send(message);
    } catch (err) {
      console.error(`[notifications] provider threw for ${event} on ${shipment.shipmentNumber}:`, err);
      result = { ok: false, error: err instanceof Error ? err.message : "unknown provider error", retryable: false };
    }

    await prisma.notificationLog.update({
      where: { id: logRow.id },
      data: result.ok
        ? { status: "SENT", providerMessageId: result.providerMessageId }
        : { status: "FAILED", providerError: result.error },
    });
  } catch (err) {
    console.error(`[notifications] dispatch failed for ${event} on shipment ${shipmentId}:`, err);
  }
}
