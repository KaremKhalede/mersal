"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBranchScope, assertBranchMatch } from "@/lib/branch-scope";
import { createShipment, updateShipmentStatus, markReadyForPickup, confirmBranchPickup, recordPayment, raiseException, resolveException, assertOwnsShipment, assertOwnsShipmentExact, updateShipmentDetails, cancelDraftShipment } from "@/modules/shipments/service";
import { confirmRemainingArrived } from "@/modules/trips/service";
import { findOrCreateCustomer } from "@/modules/customers/service";
import { assertCan } from "@/lib/rbac";
import type { ShipmentStatus, ExceptionType, PaymentMethod } from "@/lib/enums";

export async function createShipmentAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "create");

  const customer = await findOrCreateCustomer({
    companyId: user.companyId!,
    name: String(formData.get("customerName")),
    phone: String(formData.get("customerPhone")),
  });

  const cartonCount = Number(formData.get("cartonCount"));
  if (!cartonCount || cartonCount < 1) return { error: "عدد الكراتين يجب أن يكون 1 على الأقل" };

  const loadBranchId = String(formData.get("loadBranchId"));
  const unloadBranchId = String(formData.get("unloadBranchId"));
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
    shippingPrice: formData.get("shippingPrice") ? Number(formData.get("shippingPrice")) : undefined,
    amountPaid: formData.get("amountPaid") ? Number(formData.get("amountPaid")) : undefined,
    paymentMethod: (String(formData.get("paymentMethod") || "CASH")) as PaymentMethod,
  });

  revalidatePath("/app/shipments");
  return { shipmentId: shipment.id };
}

export async function receiveShipmentAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipment(user, shipmentId);
  await updateShipmentStatus(shipmentId, "RECEIVED", { userId: user.id });
  revalidatePath("/app/shipments");
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function updateShipmentStatusAction(shipmentId: string, status: ShipmentStatus) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipment(user, shipmentId);
  await updateShipmentStatus(shipmentId, status, { userId: user.id });
  revalidatePath("/app/shipments");
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function markReadyForPickupAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipment(user, shipmentId);
  await markReadyForPickup(shipmentId, user.id);
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function confirmBranchPickupAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipment(user, shipmentId);
  await confirmBranchPickup(shipmentId, user.id);
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function confirmRemainingArrivedAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipment(user, shipmentId);
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

  try {
    // updateShipmentDetails is the actual gate now (company + exact branch check inside the
    // service itself) — no separate pre-check needed here, same as customs/delivery/documents.
    await updateShipmentDetails(user.companyId!, shipmentId, {
      receiverName,
      receiverPhone,
      goodsType: String(formData.get("goodsType") || "") || undefined,
      weightKg: formData.get("weightKg") ? Number(formData.get("weightKg")) : undefined,
      notes: String(formData.get("notes") || "") || undefined,
      shippingPrice: formData.get("shippingPrice") ? Number(formData.get("shippingPrice")) : undefined,
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

export async function recordPaymentAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "edit");
  const shipmentId = String(formData.get("shipmentId"));
  try {
    // Exact branch match, not any-touch — same reasoning as updateShipmentAction above. Caught and
    // returned as data (not left to throw) so the reason reaches the client in production too —
    // Next.js redacts uncaught Server Action error messages to a bare digest on production builds,
    // same as any other server-side render error, so an unguarded throw here would only ever surface
    // a generic "an error occurred" toast once deployed, not the real "outside your branch" reason.
    await assertOwnsShipmentExact(user, shipmentId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر تسجيل الدفعة" };
  }
  const amountPaid = Number(formData.get("amountPaid"));
  if (!Number.isFinite(amountPaid) || amountPaid < 0) return { error: "مبلغ غير صالح" };
  await recordPayment(shipmentId, {
    amountPaid,
    paymentMethod: (String(formData.get("paymentMethod") || "CASH")) as PaymentMethod,
    userId: user.id,
  });
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function raiseExceptionAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  const shipmentId = String(formData.get("shipmentId"));
  await assertOwnsShipment(user, shipmentId);
  await raiseException(shipmentId, String(formData.get("exceptionType")) as ExceptionType, String(formData.get("note") || "") || undefined, user.id);
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/exceptions");
}

export async function resolveExceptionAction(shipmentId: string, toStatus?: ShipmentStatus) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await assertOwnsShipment(user, shipmentId);
  await resolveException(shipmentId, user.id, toStatus);
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/exceptions");
}
