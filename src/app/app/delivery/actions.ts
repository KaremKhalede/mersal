"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createDeliveryRequest, confirmDeliveryRequest, markOutForDelivery, markDelivered, failDelivery, cancelDeliveryRequest } from "@/modules/delivery/service";
import { getBranchScope } from "@/lib/branch-scope";
import { assertCan } from "@/lib/rbac";
import { actionResult } from "@/lib/action-result";

/**
 * The delivery service raises specific, user-meaningful reasons — "طلب التوصيل غير موجود أو لا يسمح
 * ببدء التوصيل", "تمت مراجعته بالفعل" — which are exactly what an employee needs when a colleague
 * has already actioned the same request. Thrown out of a Server Action those are replaced by an
 * opaque digest in production, so every one of these returns its failure as data instead.
 */

export async function requestDeliveryAction(shipmentId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");

    await createDeliveryRequest({
      companyId: user.companyId!,
      shipmentId,
      destinationAddress: String(formData.get("destinationAddress")),
      deliveryFee: formData.get("deliveryFee") ? Number(formData.get("deliveryFee")) : 0,
      notes: String(formData.get("notes") || ""),
      userId: user.id,
      branchScope: getBranchScope(user),
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/delivery");
  }, "تعذّر إنشاء طلب التوصيل");
}

/**
 * Approves a delivery request the customer submitted from the public tracking page (PENDING).
 * This — not the public action — is what actually dispatches the cartons, so an unauthenticated
 * request can never move goods without an employee at the branch reviewing the address first.
 */
export async function confirmDeliveryRequestAction(deliveryRequestId: string, shipmentId: string) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    await confirmDeliveryRequest(user.companyId!, deliveryRequestId, user.id, getBranchScope(user));
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/delivery");
  }, "تعذّر تأكيد طلب التوصيل");
}

export async function markOutForDeliveryAction(deliveryRequestId: string, shipmentId: string) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    await markOutForDelivery(user.companyId!, deliveryRequestId, user.id, getBranchScope(user));
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/delivery");
  }, "تعذّر بدء التوصيل");
}

/** Same permission as every other delivery-queue step (shipments.updateStatus) — the person allowed
 *  to move a delivery forward is the person allowed to close it. The proof of who took the cartons
 *  is collected in the dialog and validated in the service. */
export async function markDeliveredAction(deliveryRequestId: string, shipmentId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    await markDelivered(
      user.companyId!,
      deliveryRequestId,
      {
        receivedByName: String(formData.get("receivedByName") || ""),
        last4: String(formData.get("last4") || ""),
        note: String(formData.get("deliveryNote") || "") || undefined,
      },
      user.id,
      getBranchScope(user)
    );
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/delivery");
  }, "تعذّر تأكيد التسليم");
}

/**
 * The two ways a delivery ends without a handover. Same permission as every other step in this
 * queue — the person who may move a delivery forward is the person who may close it — and the same
 * company + branch scope, enforced inside the service's own claim.
 */
export async function failDeliveryAction(deliveryRequestId: string, shipmentId: string) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    await failDelivery(user.companyId!, deliveryRequestId, user.id, getBranchScope(user));
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/delivery");
  }, "تعذّر تسجيل فشل التوصيل");
}

export async function cancelDeliveryRequestAction(deliveryRequestId: string, shipmentId: string) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "shipments", "updateStatus");
    await cancelDeliveryRequest(user.companyId!, deliveryRequestId, user.id, getBranchScope(user));
    revalidatePath(`/app/shipments/${shipmentId}`);
    revalidatePath("/app/delivery");
  }, "تعذّر إلغاء طلب التوصيل");
}
