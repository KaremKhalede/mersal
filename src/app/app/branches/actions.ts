"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createBranch, updateBranch } from "@/modules/branches/service";
import { assertCan } from "@/lib/rbac";
import { actionResult } from "@/lib/action-result";
import { normalizePhone, phoneError } from "@/lib/phone";


/**
 * Optional-contact fields, validated the same way on both doors.
 *
 * A blank field is NULL, never "" — every consumer then tests the value itself rather than each
 * screen re-deciding whether an empty string means "no number". A field that IS filled goes through
 * the same `phoneError` gate as every other phone in the product, so a branch cannot become the one
 * place an unreachable number is accepted; and it is stored normalised (E.164), so the tracking page
 * and the driver's `tel:` link both get something dialable.
 *
 * Known limit, accepted deliberately: `normalizePhone` recognises MOBILE numbers only (Yemeni 7x,
 * Saudi 5x), so a branch whose counter is a landline cannot be recorded here. Widening it would
 * mean a second notion of "a valid phone number" in a product whose entire notification path is
 * WhatsApp, and whose single phone rule is already shared by customers, receivers, employees and
 * now branches. The field placeholders name a mobile for the same reason — a form must not suggest
 * a value its own validation refuses, which is exactly what "+967 1 234567" did on the first pass
 * here. If landlines turn out to matter in the pilot, the fix is a `tel`-only variant of
 * normalizePhone, not a looser shared rule.
 */
function readContact(formData: FormData): { phone: string | null; address: string | null } | { error: string } {
  const rawPhone = String(formData.get("phone") || "").trim();
  const address = String(formData.get("address") || "").trim();
  if (!rawPhone) return { phone: null, address: address || null };
  const problem = phoneError(rawPhone, "رقم هاتف الفرع");
  if (problem) return { error: problem };
  return { phone: normalizePhone(rawPhone), address: address || null };
}

export async function createBranchAction(formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "branches", "create");

    const contact = readContact(formData);
    if ("error" in contact) throw new Error(contact.error);

    await createBranch({
      companyId: user.companyId!,
      name: String(formData.get("name")),
      city: String(formData.get("city")),
      country: String(formData.get("country")),
      ...contact,
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

    const contact = readContact(formData);
    if ("error" in contact) throw new Error(contact.error);

    await updateBranch(user.companyId!, branchId, {
      name: String(formData.get("name")),
      city: String(formData.get("city")),
      country: String(formData.get("country")),
      ...contact,
    });

    revalidatePath("/app/branches");
  }, "تعذّر تعديل الفرع");
}
