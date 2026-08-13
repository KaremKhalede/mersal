"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createBranch, updateBranch } from "@/modules/branches/service";
import { assertCan } from "@/lib/rbac";

export async function createBranchAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "branches", "create");

  await createBranch({
    companyId: user.companyId!,
    name: String(formData.get("name")),
    city: String(formData.get("city")),
    country: String(formData.get("country")),
  });

  revalidatePath("/app/branches");
}

export async function toggleBranchStatusAction(branchId: string, status: "ACTIVE" | "INACTIVE") {
  const user = await requireCompanyUser();
  assertCan(user, "branches", "edit");
  await updateBranch(user.companyId!, branchId, { status });
  revalidatePath("/app/branches");
}
