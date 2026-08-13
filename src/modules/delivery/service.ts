import { prisma } from "@/lib/db";
import { deliveryProvider } from "./provider";
import { transitionShipmentStatusTx } from "@/modules/shipments/service";
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
    include: { customer: true },
  });
  assertSameCompany({ userType: "COMPANY_USER", companyId: params.companyId }, shipment.companyId);
  assertShipmentBranchAccess(params.branchScope, shipment);

  // Call the external provider before the DB transaction — it's not itself transactional, so we
  // don't want a slow/failing provider call to hold a DB transaction open.
  const provider = await deliveryProvider.createDelivery({
    externalRef: shipment.shipmentNumber,
    customerName: shipment.customer.name,
    customerPhone: shipment.customer.phone,
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
          customerName: shipment.customer.name,
          customerPhone: shipment.customer.phone,
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

export async function markDelivered(companyId: string, deliveryRequestId: string, userId?: string, branchScope?: string | null) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const req = await prisma.$transaction(async (tx) => {
    const claim = await tx.deliveryRequest.updateMany({
      where: { id: deliveryRequestId, companyId, status: "OUT_FOR_DELIVERY", ...(branchScope ? { pickupBranchId: branchScope } : {}) },
      data: { status: "DELIVERED" },
    });
    if (claim.count === 0) throw new Error("طلب التوصيل غير موجود أو لا يسمح بتأكيد التسليم");
    const r = await tx.deliveryRequest.findUniqueOrThrow({ where: { id: deliveryRequestId } });
    await tx.carton.updateMany({ where: { shipmentId: r.shipmentId }, data: { status: "DELIVERED" } });
    const { event: e, trackingEventId: t } = await transitionShipmentStatusTx(tx, r.shipmentId, "DELIVERED", { note: "تم التسليم عبر أرشي" });
    event = e;
    trackingEventId = t;
    return r;
  });

  if (event) await dispatchShipmentEvent(event, req.shipmentId, trackingEventId);
  await logAudit({ companyId: req.companyId, userId, action: "DELIVERED", entityType: "DeliveryRequest", entityId: req.id });
  return req;
}

export async function listDeliveryRequests(companyId: string, branchId?: string | null) {
  return prisma.deliveryRequest.findMany({
    where: { companyId, ...(branchId ? { pickupBranchId: branchId } : {}) },
    include: { shipment: true },
    orderBy: { createdAt: "desc" },
  });
}
