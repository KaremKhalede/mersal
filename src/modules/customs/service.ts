import { prisma } from "@/lib/db";
import type { CustomsStatus } from "@/lib/enums";
import { transitionShipmentStatusTx } from "@/modules/shipments/service";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { assertSameCompany } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { shipmentTouchesBranch, assertShipmentBranchAccess } from "@/lib/branch-scope";

export async function getOrCreateCustomsCase(companyId: string, shipmentId: string, branchScope?: string | null) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, shipment.companyId);
  assertShipmentBranchAccess(branchScope, shipment);

  const existing = await prisma.customsCase.findUnique({ where: { shipmentId } });
  if (existing) return existing;
  return prisma.customsCase.create({ data: { companyId, shipmentId } });
}

export async function updateCustomsStatus(
  companyId: string,
  customsCaseId: string,
  status: CustomsStatus,
  opts: { userId?: string; notes?: string; branchScope?: string | null } = {}
) {
  const existing = await prisma.customsCase.findUniqueOrThrow({ where: { id: customsCaseId }, include: { shipment: true } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, existing.companyId);
  assertShipmentBranchAccess(opts.branchScope, existing.shipment);

  const updated = await prisma.customsCase.update({
    where: { id: customsCaseId },
    data: { status, notes: opts.notes },
  });

  if (status === "ON_HOLD") {
    // Transitions the shipment to EXCEPTION like any other exception path, but dispatches the more
    // specific CUSTOMS_HOLD event instead of the generic one a plain updateShipmentStatus call would
    // send — a customs hold has its own, more useful customer message (see templates.ts). Previously
    // this called updateShipmentStatus (which dispatches its own generic EXCEPTION event) *and* a
    // separate CUSTOMS_HOLD dispatch, sending two notifications for one hold. Everything happens in
    // one transaction, same atomic shape as shipments/service.ts's raiseException.
    const { fromStatus, trackingEventId } = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.findUniqueOrThrow({ where: { id: updated.shipmentId } });
      const result = await transitionShipmentStatusTx(tx, updated.shipmentId, "EXCEPTION", { note: "محجوزة جمركياً" });
      await tx.shipment.update({
        where: { id: updated.shipmentId },
        data: { exceptionType: "CUSTOMS_HOLD", exceptionNote: "محجوزة جمركياً", statusBeforeException: s.status },
      });
      return result;
    });

    await logAudit({ companyId, userId: opts.userId, action: "STATUS_CHANGE", entityType: "Shipment", entityId: updated.shipmentId, metadata: { from: fromStatus, to: "EXCEPTION" } });
    await dispatchShipmentEvent("CUSTOMS_HOLD", updated.shipmentId, trackingEventId);
  }

  return updated;
}

export async function listCustomsCases(companyId: string, branchId?: string | null) {
  return prisma.customsCase.findMany({
    where: { companyId, ...(branchId ? { shipment: shipmentTouchesBranch(branchId) } : {}) },
    include: { shipment: { include: { customer: true } } },
    orderBy: { updatedAt: "desc" },
  });
}
