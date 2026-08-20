"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createBranch, updateBranch } from "@/modules/branches/service";
import { assertCan } from "@/lib/rbac";
import { actionResult } from "@/lib/action-result";

export async function createBranchAction(formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "branches", "create");

    await createBranch({
      companyId: user.companyId!,
      name: String(formData.get("name")),
      city: String(formData.get("city")),
      country: String(formData.get("country")),
    });

    revalidatePath("/app/branches");
  }, "تعذّر إضافة الفرع");
}

export async function toggleBranchStatusAction(branchId: string, status: "ACTIVE" | "INACTIVE") {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "branches", "edit");
    await updateBranch(user.companyId!, branchId, { status });
    revalidatePath("/app/branches");
  }, "تعذّر تحديث حالة الفرع");
}

export async function updateBranchAction(branchId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "branches", "edit");

    await updateBranch(user.companyId!, branchId, {
      name: String(formData.get("name")),
      city: String(formData.get("city")),
      country: String(formData.get("country")),
    });

    revalidatePath("/app/branches");
  }, "تعذّر تعديل الفرع");
}
