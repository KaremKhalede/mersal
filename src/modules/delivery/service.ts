import { prisma } from "@/lib/db";
import { deliveryProvider } from "./provider";
import { transitionShipmentStatusTx, deliveryProofData, handoverNote, type DeliveryProofInput } from "@/modules/shipments/service";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { logAudit } from "@/lib/audit";
import { assertSameCompany } from "@/lib/tenant";
import { assertShipmentBranchAccess } from "@/lib/branch-scope";
import type { ShipmentEvent } from "@/lib/enums";

/**
 * Creates a delivery request exactly once per shipment, even under a double-click or a duplicate
 * public-tracking-page submit. The shipment's own status is the idempotency guard: claiming the
 * ARRIVED/READY_FOR_PICKUP -> DELIVERY_REQUESTED transition atomically (inside the same transaction
 * as the DeliveryRequest insert) means a second concurrent call finds the status already moved on
 * and is rejected before it can create a second Arshi order — instead of racing past the check and
 * hitting the DB's unique(shipmentId) constraint with a raw, unhandled error.
 */
export async function createDeliveryRequest(params: {
  companyId: string;
  shipmentId: string;
  destinationAddress: string;
  deliveryFee?: number;
  notes?: string;
  userId?: string;
  branchScope?: string | null;
}) {
  const existing = await prisma.deliveryRequest.findUnique({ where: { shipmentId: params.shipmentId } });
  if (existing) return existing;

  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: params.shipmentId },
  });
  assertSameCompany({ userType: "COMPANY_USER", companyId: params.companyId }, shipment.companyId);
  assertShipmentBranchAccess(params.branchScope, shipment);

  // Call the external provider before the DB transaction — it's not itself transactional, so we
  // don't want a slow/failing provider call to hold a DB transaction open.
  const provider = await deliveryProvider.createDelivery({
    externalRef: shipment.shipmentNumber,
    customerName: shipment.receiverName,
    customerPhone: shipment.receiverPhone,
    pickupAddress: shipment.currentBranchId ?? "",
    destinationAddress: params.destinationAddress,
    cartonCount: shipment.totalCartons,
  });

  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;
  let request;
  try {
    request = await prisma.$transaction(async (tx) => {
      const { event: e, trackingEventId: t } = await transitionShipmentStatusTx(tx, params.shipmentId, "DELIVERY_REQUESTED", {});
      event = e;
      trackingEventId = t;
      return tx.deliveryRequest.create({
        data: {
          companyId: params.companyId,
          shipmentId: params.shipmentId,
          customerName: shipment.receiverName,
          customerPhone: shipment.receiverPhone,
          pickupBranchId: shipment.currentBranchId ?? shipment.unloadBranchId,
          destinationAddress: params.destinationAddress,
          cartonCount: shipment.totalCartons,
          deliveryFee: params.deliveryFee ?? 0,
          notes: params.notes,
          status: "ASSIGNED",
          providerRef: provider.providerRef,
        },
      });
    });
  } catch {
    // Lost the race to a concurrent request (invalid transition, or unique(shipmentId) hit) — the
    // winner's row is now authoritative, return it instead of surfacing a raw 500.
    const winner = await prisma.deliveryRequest.findUnique({ where: { shipmentId: params.shipmentId } });
    if (winner) return winner;
    throw new Error("تعذّر إنشاء طلب التوصيل");
  }

  if (event) await dispatchShipmentEvent(event, params.shipmentId, trackingEventId);
  await logAudit({ companyId: params.companyId, userId: params.userId, action: "CREATE", entityType: "DeliveryRequest", entityId: request.id });

  return request;
}

/**
 * The customer's own request from the public tracking page.
 *
 * Deliberately NOT createDeliveryRequest(): that one calls the delivery provider immediately and
 * lands on ASSIGNED, i.e. it dispatches real cartons. A request that arrives over an unauthenticated
 * public route must never do that on its own. This creates the request in PENDING — a state that was
 * already modelled in DELIVERY_STATUSES but, until now, never actually produced by anything — and
 * calls no provider. A human at the destination branch reviews it and calls confirmDeliveryRequest()
 * before anything moves.
 *
 * That review step is the last line of defence for P0-1: even if a tracking link and the receiver's
 * last 4 digits were both compromised, the worst an attacker achieves is *proposing* an address to
 * an employee who knows the customer — not redirecting the goods.
 *
 * The shipment still transitions to DELIVERY_REQUESTED, because the customer genuinely did request
 * delivery and the tracking timeline should say so.
 */
export async function requestDeliveryFromCustomer(params: {
  shipmentId: string;
  destinationAddress: string;
  notes?: string;
}) {
  const existing = await prisma.deliveryRequest.findUnique({ where: { shipmentId: params.shipmentId } });
  if (existing) return existing;

  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: params.shipmentId },
  });

  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;
  let request;
  try {
    request = await prisma.$transaction(async (tx) => {
      const { event: e, trackingEventId: t } = await transitionShipmentStatusTx(tx, params.shipmentId, "DELIVERY_REQUESTED", {});
      event = e;
      trackingEventId = t;
      return tx.deliveryRequest.create({
        data: {
          companyId: shipment.companyId,
          shipmentId: params.shipmentId,
          customerName: shipment.receiverName,
          customerPhone: shipment.receiverPhone,
          pickupBranchId: shipment.currentBranchId ?? shipment.unloadBranchId,
          destinationAddress: params.destinationAddress,
          cartonCount: shipment.totalCartons,
          deliveryFee: 0,
          notes: params.notes,
          status: "PENDING",
        },
      });
    });
  } catch {
    // Lost the race to a concurrent submit — the winner's row is authoritative.
    const winner = await prisma.deliveryRequest.findUnique({ where: { shipmentId: params.shipmentId } });
    if (winner) return winner;
    throw new Error("تعذّر إنشاء طلب التوصيل");
  }

  if (event) await dispatchShipmentEvent(event, params.shipmentId, trackingEventId);
  await logAudit({
    companyId: shipment.companyId,
    action: "CREATE",
    entityType: "DeliveryRequest",
    entityId: request.id,
    metadata: { source: "public-tracking", status: "PENDING" },
  });
  return request;
}

/**
 * Office-side approval of a customer-submitted request: PENDING -> ASSIGNED, dispatching to the
 * delivery provider only now. Same guarded-claim pattern as every other transition here, so a
 * double-click or a second employee cannot dispatch the same request twice.
 */
export async function confirmDeliveryRequest(
  companyId: string,
  deliveryRequestId: string,
  userId?: string,
  branchScope?: string | null
) {
  const claim = await prisma.deliveryRequest.updateMany({
    where: { id: deliveryRequestId, companyId, status: "PENDING", ...(branchScope ? { pickupBranchId: branchScope } : {}) },
    data: { status: "ASSIGNED" },
  });
  if (claim.count === 0) throw new Error("طلب التوصيل غير موجود أو تمت مراجعته بالفعل");

  const req = await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: deliveryRequestId } });
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: req.shipmentId } });

  // Provider call sits outside the claim on purpose: it is not transactional, and the claim above
  // already guarantees only one caller reaches this point.
  const provider = await deliveryProvider.createDelivery({
    externalRef: shipment.shipmentNumber,
    customerName: req.customerName,
    customerPhone: req.customerPhone,
    pickupAddress: req.pickupBranchId,
    destinationAddress: req.destinationAddress,
    cartonCount: req.cartonCount,
  });
  const updated = await prisma.deliveryRequest.update({
    where: { id: req.id },
    data: { providerRef: provider.providerRef },
  });

  await logAudit({ companyId, userId, action: "CONFIRM_DELIVERY_REQUEST", entityType: "DeliveryRequest", entityId: req.id });
  return updated;
}
export async function markOutForDelivery(companyId: string, deliveryRequestId: string, userId?: string, branchScope?: string | null) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const req = await prisma.$transaction(async (tx) => {
    // branchScope folded straight into the guarded updateMany's WHERE — same atomic
    // claim-or-lose-the-race pattern the file already uses, authorization and the write in one step.
    const claim = await tx.deliveryRequest.updateMany({
      where: { id: deliveryRequestId, companyId, status: "ASSIGNED", ...(branchScope ? { pickupBranchId: branchScope } : {}) },
      data: { status: "OUT_FOR_DELIVERY" },
    });
    if (claim.count === 0) throw new Error("طلب التوصيل غير موجود أو لا يسمح ببدء التوصيل");
    const r = await tx.deliveryRequest.findUniqueOrThrow({ where: { id: deliveryRequestId } });
    const { event: e, trackingEventId: t } = await transitionShipmentStatusTx(tx, r.shipmentId, "OUT_FOR_DELIVERY", {});
    event = e;
    trackingEventId = t;
    return r;
  });

  if (event) await dispatchShipmentEvent(event, req.shipmentId, trackingEventId);
  await logAudit({ companyId: req.companyId, userId, action: "OUT_FOR_DELIVERY", entityType: "DeliveryRequest", entityId: req.id });
  return req;
}

/**
 * Closes a home delivery, recording the same proof of delivery the branch counter records — same
 * validator, same columns, only the channel differs. The employee (or, once P1-6 lands, the driver)
 * confirming this is standing where the cartons were handed over, so they are the one who can name
 * who took them.
 *
 * The existing guarded updateMany stays the duplicate-delivery guard: a second confirmation finds
 * the request no longer OUT_FOR_DELIVERY and is rejected before any proof is written. A wrong
 * last-4 throws inside the same transaction, so the claim rolls back with it and the request is
 * left exactly as it was, ready to be retried.
 */
export async function markDelivered(
  companyId: string,
  deliveryRequestId: string,
  proof: DeliveryProofInput,
  userId?: string,
  branchScope?: string | null
) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;
  let missingCount = 0;

  const req = await prisma.$transaction(async (tx) => {
    const claim = await tx.deliveryRequest.updateMany({
      where: { id: deliveryRequestId, companyId, status: "OUT_FOR_DELIVERY", ...(branchScope ? { pickupBranchId: branchScope } : {}) },
      data: { status: "DELIVERED" },
    });
    if (claim.count === 0) throw new Error("طلب التوصيل غير موجود أو لا يسمح بتأكيد التسليم");
    const r = await tx.deliveryRequest.findUniqueOrThrow({ where: { id: deliveryRequestId } });
    const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: r.shipmentId } });
    const proofData = deliveryProofData(shipment, proof, "HOME_DELIVERY");
    const missing = await tx.carton.findMany({ where: { shipmentId: r.shipmentId, status: "MISSING" }, select: { cartonCode: true } });
    missingCount = missing.length;

    // Same rule as the branch counter: a carton that never arrived cannot be delivered, so the
    // blanket "everything is DELIVERED now" update excludes it rather than overwriting the record.
    await tx.carton.updateMany({ where: { shipmentId: r.shipmentId, status: { not: "MISSING" } }, data: { status: "DELIVERED" } });
    const { event: e, trackingEventId: t } = await transitionShipmentStatusTx(tx, r.shipmentId, "DELIVERED", {
      note: handoverNote("تم التسليم إلى العنوان", proofData.deliveredToName, missing),
    });
    await tx.shipment.update({ where: { id: r.shipmentId }, data: proofData });
    event = e;
    trackingEventId = t;
    return r;
  });

  if (event) await dispatchShipmentEvent(event, req.shipmentId, trackingEventId, { missingCount });
  await logAudit({ companyId: req.companyId, userId, action: "DELIVERED", entityType: "DeliveryRequest", entityId: req.id, metadata: { channel: "HOME_DELIVERY", missingCount } });
  return req;
}

/**
 * Closes a delivery request that did not end in a handover, and puts the shipment back where the
 * cartons physically are: the destination branch counter.
 *
 * Two outcomes, one mechanism, because they differ only in when they happen and what they are
 * called — FAILED after the driver went out and could not hand over, CANCELLED before anything
 * left. Both are real statuses on the request rather than something derived: "this request ended
 * without a delivery" is a fact about the request, and deriving it from the shipment's status would
 * make the two records disagree the moment the shipment moves on for any other reason.
 *
 * The guarded updateMany is the same claim pattern the rest of this file uses: it carries the
 * company scope, the branch scope and the set of statuses this outcome is legal from, so a request
 * already closed by a colleague matches zero rows instead of being closed twice.
 *
 * No attempt history is kept. If the office wants to try again they create a new request, which is
 * the same flow as the first one and leaves the same records.
 */
async function closeDeliveryRequest(params: {
  companyId: string;
  deliveryRequestId: string;
  outcome: "FAILED" | "CANCELLED";
  fromStatuses: string[];
  note: string;
  userId?: string;
  branchScope?: string | null;
}) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const req = await prisma.$transaction(async (tx) => {
    const claim = await tx.deliveryRequest.updateMany({
      where: {
        id: params.deliveryRequestId,
        companyId: params.companyId,
        status: { in: params.fromStatuses },
        ...(params.branchScope ? { pickupBranchId: params.branchScope } : {}),
      },
      data: { status: params.outcome },
    });
    if (claim.count === 0) throw new Error("طلب التوصيل غير موجود أو لا يسمح بهذا الإجراء");
    const r = await tx.deliveryRequest.findUniqueOrThrow({ where: { id: params.deliveryRequestId } });

    // The cartons never left the branch (cancelled) or came back to it (failed), so the shipment
    // returns to being collectable. Cartons are untouched on purpose: nothing about a delivery that
    // did not happen changes which cartons arrived.
    const { event: e, trackingEventId: t } = await transitionShipmentStatusTx(tx, r.shipmentId, "READY_FOR_PICKUP", {
      note: params.note,
    });
    event = e;
    trackingEventId = t;
    return r;
  });

  if (event) await dispatchShipmentEvent(event, req.shipmentId, trackingEventId);
  await logAudit({
    companyId: req.companyId,
    userId: params.userId,
    action: params.outcome === "FAILED" ? "DELIVERY_FAILED" : "DELIVERY_CANCELLED",
    entityType: "DeliveryRequest",
    entityId: req.id,
  });
  return req;
}

/** The driver or courier went out and could not hand the cartons over. */
export async function failDelivery(companyId: string, deliveryRequestId: string, userId?: string, branchScope?: string | null) {
  return closeDeliveryRequest({
    companyId,
    deliveryRequestId,
    outcome: "FAILED",
    fromStatuses: ["OUT_FOR_DELIVERY"],
    note: "تعذّر التوصيل — الشحنة متاحة للاستلام من الفرع",
    userId,
    branchScope,
  });
}

/**
 * The request is called off before the cartons leave the branch. Legal only while nothing has gone
 * out — once a delivery is under way the honest outcome is FAILED, not "it never happened".
 */
export async function cancelDeliveryRequest(companyId: string, deliveryRequestId: string, userId?: string, branchScope?: string | null) {
  const request = await prisma.deliveryRequest.findUnique({ where: { id: deliveryRequestId }, select: { providerRef: true, companyId: true } });
  // A request already handed to the provider is withdrawn there too, through the same boundary that
  // created it — otherwise the courier still has an order the office thinks it cancelled.
  if (request?.companyId === companyId && request.providerRef) {
    try {
      await deliveryProvider.cancelDelivery(request.providerRef);
    } catch (err) {
      console.error("[delivery] provider cancel failed:", err);
    }
  }

  return closeDeliveryRequest({
    companyId,
    deliveryRequestId,
    outcome: "CANCELLED",
    fromStatuses: ["PENDING", "ASSIGNED"],
    note: "أُلغي طلب التوصيل — الشحنة متاحة للاستلام من الفرع",
    userId,
    branchScope,
  });
}

export async function listDeliveryRequests(companyId: string, branchId?: string | null) {
  return prisma.deliveryRequest.findMany({
    where: { companyId, ...(branchId ? { pickupBranchId: branchId } : {}) },
    // Cartons ride along so the queue's confirm dialog can warn about a shortfall before an
    // employee signs a short handover off as a complete one.
    include: { shipment: { include: { cartons: { select: { cartonCode: true, status: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}
