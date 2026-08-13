"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { findOrCreateCustomer } from "@/modules/customers/service";
import { assertCan } from "@/lib/rbac";

export async function createCustomerAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "customers", "create");

  await findOrCreateCustomer({
    companyId: user.companyId!,
    name: String(formData.get("name")),
    phone: String(formData.get("phone")),
    address: String(formData.get("address") || ""),
  });

  revalidatePath("/app/customers");
}
