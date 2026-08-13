"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createDeliveryRequest, markOutForDelivery, markDelivered } from "@/modules/delivery/service";
import { getBranchScope } from "@/lib/branch-scope";
import { assertCan } from "@/lib/rbac";

export async function requestDeliveryAction(shipmentId: string, formData: FormData) {
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
}

export async function markOutForDeliveryAction(deliveryRequestId: string, shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await markOutForDelivery(user.companyId!, deliveryRequestId, user.id, getBranchScope(user));
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/delivery");
}

export async function markDeliveredAction(deliveryRequestId: string, shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "shipments", "updateStatus");
  await markDelivered(user.companyId!, deliveryRequestId, user.id, getBranchScope(user));
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/delivery");
}
