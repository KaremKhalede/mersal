"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { getOrCreateCustomsCase, updateCustomsStatus } from "@/modules/customs/service";
import { getBranchScope } from "@/lib/branch-scope";
import { assertCan } from "@/lib/rbac";
import type { CustomsStatus } from "@/lib/enums";

export async function openCustomsCaseAction(shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "customs", "edit");
  await getOrCreateCustomsCase(user.companyId!, shipmentId, getBranchScope(user));
  revalidatePath(`/app/shipments/${shipmentId}`);
}

export async function updateCustomsStatusAction(customsCaseId: string, shipmentId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "customs", "edit");
  await updateCustomsStatus(user.companyId!, customsCaseId, String(formData.get("status")) as CustomsStatus, {
    userId: user.id,
    notes: String(formData.get("notes") || ""),
    branchScope: getBranchScope(user),
  });
  revalidatePath(`/app/shipments/${shipmentId}`);
  revalidatePath("/app/customs");
}
