"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { findOrCreateCustomer, findCustomerByPhone, updateCustomer } from "@/modules/customers/service";
import { assertCan } from "@/lib/rbac";
import { phoneError } from "@/lib/phone";

/** Never creates a second Customer row for a phone already on file within the company — the
 * "إضافة عميل" dialog reports back which case happened (existed vs created) so the employee sees
 * the matched record instead of assuming a new one was made. */
export async function createCustomerAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "customers", "create");

  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !phone) return { error: "الاسم ورقم الجوال مطلوبان" };
  // Caught at the counter, not days later as a FAILED WhatsApp row — see phoneError.
  const phoneProblem = phoneError(phone, "رقم جوال العميل");
  if (phoneProblem) return { error: phoneProblem };

  const existing = await findCustomerByPhone(user.companyId!, phone);
  const customer = await findOrCreateCustomer({
    companyId: user.companyId!,
    name,
    phone,
    email: String(formData.get("email") || "").trim() || undefined,
    address: String(formData.get("address") || "").trim() || undefined,
    homeBranchId: String(formData.get("homeBranchId") || "").trim() || undefined,
  });

  revalidatePath("/app/customers");
  return { existed: !!existing, customerId: customer.id, customerName: customer.name };
}

export async function updateCustomerAction(customerId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "customers", "edit");

  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  if (!name || !phone) return { error: "الاسم ورقم الجوال مطلوبان" };
  // Caught at the counter, not days later as a FAILED WhatsApp row — see phoneError.
  const phoneProblem = phoneError(phone, "رقم جوال العميل");
  if (phoneProblem) return { error: phoneProblem };

  await updateCustomer(user.companyId!, customerId, {
    name,
    phone,
    email: String(formData.get("email") || "").trim() || null,
    address: String(formData.get("address") || "").trim() || null,
    homeBranchId: String(formData.get("homeBranchId") || "").trim() || null,
  });

  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${customerId}`);
}

export async function toggleCustomerStatusAction(customerId: string, status: "ACTIVE" | "INACTIVE") {
  const user = await requireCompanyUser();
  assertCan(user, "customers", "edit");
  await updateCustomer(user.companyId!, customerId, { status });
  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${customerId}`);
}
