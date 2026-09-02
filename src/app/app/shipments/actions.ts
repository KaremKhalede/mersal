"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBranchScope, assertBranchMatch } from "@/lib/branch-scope";
import { createShipment, updateShipmentStatus, markReadyForPickup, confirmBranchPickup, raiseException, resolveException, assertOwnsShipmentPhysical, updateShipmentDetails, cancelDraftShipment, listShipmentsForExport, confirmLateCartons } from "@/modules/shipments/service";
import { confirmRemainingArrived } from "@/modules/trips/service";
import { findOrCreateCustomer } from "@/modules/customers/service";
import { assertCan } from "@/lib/rbac";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus, type ExceptionType } from "@/lib/enums";
import { actionResult } from "@/lib/action-result";
import { phoneError } from "@/lib/phone";
import { toCsv } from "@/lib/csv";

export async function createShipmentAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "create");

  // Everything rejectable is validated before anything is written: the customer row is created by
  // findOrCreateCustomer below, so a bad number would otherwise persist a customer nobody can
  // reach. The receiver defaults to the customer when left blank, exactly as it does further down.
  const customerPhone = String(formData.get("customerPhone") || "").trim();
  const receiverPhoneRaw = String(formData.get("receiverPhone") || "").trim();
  for (const [value, label] of [
    [customerPhone, "رقم جوال العميل"],
    [receiverPhoneRaw || customerPhone, "رقم جوال المستلم"],
  ] as const) {
    const problem = phoneError(value, label);
    if (problem) return { error: problem };
  }

  const cartonCount = Number(formData.get("cartonCount"));
  if (!cartonCount || cartonCount < 1) return { error: "عدد الكراتين يجب أن يكون 1 على الأقل" };



  const loadBranchId = String(formData.get("loadBranchId") || "");
  const unloadBranchId = String(formData.get("unloadBranchId") || "");
  // Left blank is a slip, not a bad id, and the two need different words. This is now the only
  // thing standing between an unfilled branch and a saved shipment: the `required` that used to sit
  // on these two <Select>s was on Radix's aria-hidden native proxy, which Chrome cannot focus — so
  // it blocked the submit and showed nothing at all. The wording names the field's own label so the
  // toast points at something the user can see on screen.
  if (!loadBranchId) return { error: "اختر فرع التحميل (المنشأ)" };
  if (!unloadBranchId) return { error: "اختر فرع التفريغ (الوجهة)" };
  const [loadBranch, unloadBranch] = await Promise.all([
    prisma.branch.findUnique({ where: { id: loadBranchId } }),
    prisma.branch.findUnique({ where: { id: unloadBranchId } }),
  ]);
  if (loadBranch?.companyId !== user.companyId || unloadBranch?.companyId !== user.companyId) {
    return { error: "فرع غير صالح" };
  }
  // A branch-scoped employee can only intake cartons at their own branch — the destination can be
  // any branch, but where the customer physically handed the cartons over cannot be spoofed.
  try {
    assertBranchMatch(getBranchScope(user), loadBranchId);
  } catch {
    return { error: "لا يمكنك تسجيل شحنة من فرع غير فرعك" };
  }

  const customer = await findOrCreateCustomer({
    companyId: user.companyId!,
    name: String(formData.get("customerName")),
    phone: customerPhone,
  });

  const shipment = await createShipment({
    companyId: user.companyId!,
    customerId: customer.id,
    receiverName: String(formData.get("receiverName") || customer.name),
    receiverPhone: String(formData.get("receiverPhone") || customer.phone),
    loadBranchId,
    unloadBranchId,
    cartonCount,
    goodsType: String(formData.get("goodsType") || ""),
    weightKg: formData.get("weightKg") ? Number(formData.get("weightKg")) : undefined,
    notes: String(formData.get("notes") || ""),
    createdById: user.id,
  });

  revalidatePath("/app/shipments");
  return { shipmentId: shipment.id };
}

export async function receiveShipmentAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipmentPhysical(user, shipmentId);
  await updateShipmentStatus(shipmentId, "RECEIVED", { userId: user.id });
  revalidatePath("/app/shipments");
  revalidatePath(`/app/shipments/${shipmentId}`);
}

// REMOVED: updateShipmentStatusAction(shipmentId, status).
//
// A Server Action taking an arbitrary target status, exported and reachable by any authenticated
// employee holding shipments.updateStatus, with no caller anywhere in the app. The state machine
// stopped it inventing an illegal transition, but READY_FOR_PICKUP -> DELIVERED is perfectly legal
// — so it could produce a DELIVERED shipment with no deliveredAt, no deliveredToName, no channel,
// and cartons never flipped: exactly the "status says delivered, nobody knows who took it"
// disagreement the delivery-proof columns exist to make impossible.
//
// Deleted rather than guarded. Every real transition already has a purpose-built action that knows
// what evidence its own step requires — receiveShipmentAction, markReadyForPickupAction,
// confirmBranchPickupAction (proof), markDelivered (proof), the trip load/unload/depart actions,
// raise/resolveExceptionAction, cancelShipmentAction. A generic status setter is not a missing
// feature, it is a way around all of them.
export async function markReadyForPickupAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipmentPhysical(user, shipmentId);
  await markReadyForPickup(shipmentId, user.id);
  revalidatePath(`/app/shipments/${shipmentId}`);
}

/**
 * Branch-counter handover. Authorization is unchanged and is what actually gates this: an
 * authenticated employee, holding shipments.updateStatus, whose branch has touched this shipment.
 * The proof fields collected in the dialog are evidence recorded alongside the handover, not a
 * second credential — see deliveryProofData() for why that distinction matters.
 *
 * Wrapped in actionResult so a wrong last-4 comes back as the real Arabic reason instead of a
 * production digest, which is what makes "try again" a usable instruction at a counter.
 */
export async function confirmBranchPickupAction(shipmentId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    await assertOwnsShipmentPhysical(user, shipmentId);
    await confirmBranchPickup(
      shipmentId,
      {
        receivedByName: String(formData.get("receivedByName") || ""),
        last4: String(formData.get("last4") || ""),
        note: String(formData.get("deliveryNote") || "") || undefined,
      },
      user.id
    );
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/shipments");
  }, "تعذّر تسجيل التسليم");
}

export async function confirmRemainingArrivedAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipmentPhysical(user, shipmentId);
  await confirmRemainingArrived(shipmentId, user.id);
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function updateShipmentAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "edit");
  const shipmentId = String(formData.get("shipmentId"));

  const receiverName = String(formData.get("receiverName") || "").trim();
  const receiverPhone = String(formData.get("receiverPhone") || "").trim();
  if (!receiverName || !receiverPhone) return { error: "اسم المستلم وجواله مطلوبان" };
  const receiverPhoneProblem = phoneError(receiverPhone, "رقم جوال المستلم");
  if (receiverPhoneProblem) return { error: receiverPhoneProblem };

  try {
    // updateShipmentDetails is the actual gate now (company + exact branch check inside the
    // service itself) — no separate pre-check needed here, same as customs/delivery/documents.
    await updateShipmentDetails(user.companyId!, shipmentId, {
      receiverName,
      receiverPhone,
      goodsType: String(formData.get("goodsType") || "") || undefined,
      weightKg: formData.get("weightKg") ? Number(formData.get("weightKg")) : undefined,
      notes: String(formData.get("notes") || "") || undefined,
    }, { userId: user.id, branchScope: getBranchScope(user) });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تعديل الشحنة" };
  }
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/shipments");
}

export async function cancelShipmentAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "cancel");
  // cancelDraftShipment is the actual gate now (company + branch check inside the service itself).
  await cancelDraftShipment(user.companyId!, shipmentId, { userId: user.id, branchScope: getBranchScope(user) });
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/shipments");
}


export async function raiseExceptionAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  const shipmentId = String(formData.get("shipmentId"));
  await assertOwnsShipmentPhysical(user, shipmentId);
  await raiseException(shipmentId, String(formData.get("exceptionType")) as ExceptionType, String(formData.get("note") || "") || undefined, user.id);
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/exceptions");
}

export async function resolveExceptionAction(shipmentId: string, toStatus?: ShipmentStatus) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipmentPhysical(user, shipmentId);
  await resolveException(shipmentId, user.id, toStatus);
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/exceptions");
}

/** CSV text for the "تصدير" button — same filters as whatever's currently on screen, but every
 * matching row, not just the current page. The caller (export-button.tsx) prepends a UTF-8 BOM
 * before download, which Excel needs to render Arabic text correctly instead of mojibake. */
export async function exportShipmentsCsvAction(params: { status?: ShipmentStatus; search?: string; branchId?: string | null }) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "view");
  const scope = getBranchScope(user);
  const items = await listShipmentsForExport({
    companyId: user.companyId!,
    status: params.status,
    search: params.search,
    branchId: scope ?? params.branchId,
  });

  // Blank — not "0" — when no price was agreed yet.
  const header = ["رقم الشحنة", "العميل", "من", "إلى", "الكراتين الواصلة", "إجمالي الكراتين", "الحالة", "تاريخ الإنشاء"];
  const rows = items.map((s) => [
    s.shipmentNumber,
    s.customer.name,
    s.loadBranch.name,
    s.unloadBranch.name,
    String(s.arrivedCartons),
    String(s.totalCartons),
    SHIPMENT_STATUS_LABELS[s.status as ShipmentStatus] ?? s.status,
    s.createdAt.toISOString().slice(0, 10),
  ]);
  return toCsv(header, rows);
}

export async function getShipmentsForPrintAction(params: { status?: ShipmentStatus; search?: string; branchId?: string | null }) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "view");
  const scope = getBranchScope(user);
  const items = await listShipmentsForExport({
    companyId: user.companyId!,
    status: params.status,
    search: params.search,
    branchId: scope ?? params.branchId,
  });

  return {
    companyName: user.company!.name,
    items: items.map(s => ({
      id: s.id,
      shipmentNumber: s.shipmentNumber,
      customerName: s.customer.name,
      customerPhone: s.customer.phone,
      loadBranchName: s.loadBranch.name,
      unloadBranchName: s.unloadBranch.name,
      arrivedCartons: s.arrivedCartons,
      totalCartons: s.totalCartons,
      status: s.status as ShipmentStatus,
      createdAt: s.createdAt.toISOString(),
    }))
  };
}

/**
 * Records a carton that was missing at handover and has since turned up. Same permission as every
 * other operational shipment change; the service is the real gate (company + branch + the shipment
 * must actually be delivered, and the cartons must actually be its own missing ones).
 */
export async function confirmLateCartonsAction(shipmentId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    const result = await confirmLateCartons(user.companyId!, shipmentId, formData.getAll("cartonIds").map(String), {
      userId: user.id,
      branchScope: getBranchScope(user),
    });
    revalidatePath(`/app/shipments/${shipmentId}`);
    return result;
  }, "تعذّر تسجيل وصول الكرتون");
}
