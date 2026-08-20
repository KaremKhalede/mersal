"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { getOrCreateCustomsCase, updateCustomsStatus } from "@/modules/customs/service";
import { getBranchScope } from "@/lib/branch-scope";
import { assertCan } from "@/lib/rbac";
import { actionResult } from "@/lib/action-result";
import type { CustomsStatus } from "@/lib/enums";

/** Provisions the CustomsCase on first save (if it doesn't exist yet) and applies the status update
 * in one step — the UI never exposes a separate "open a customs file" action. */
export async function saveCustomsStatusAction(shipmentId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "customs", "edit");
    const branchScope = getBranchScope(user);

    const customsCase = await getOrCreateCustomsCase(user.companyId!, shipmentId, branchScope);
    await updateCustomsStatus(user.companyId!, customsCase.id, String(formData.get("status")) as CustomsStatus, {
      userId: user.id,
      notes: String(formData.get("notes") || ""),
      branchScope,
    });

    revalidatePath(`/app/shipments/${shipmentId}`);
  }, "تعذّر حفظ الحالة الجمركية");
}
