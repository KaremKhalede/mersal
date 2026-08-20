"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createEmployee, updateEmployee, updateEmployeeStatus } from "@/modules/users/service";
import { createPasswordReset, resetUrlFor } from "@/modules/users/password-reset";
import { assertCan } from "@/lib/rbac";
import { getBranchScope, assertBranchMatch } from "@/lib/branch-scope";
import { assertPasswordStrength } from "@/lib/password";
import { actionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

function isDuplicateEmail(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (e.meta?.target as string[] | undefined)?.includes("email");
}

export async function createEmployeeAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "employees", "create");

  const password = String(formData.get("password") || "");
  const passwordConfirm = String(formData.get("passwordConfirm") || "");
  if (password !== passwordConfirm) return { error: "كلمتا المرور غير متطابقتين" };
  // Employee and driver accounts had no length requirement at all — the accounts that hold every
  // shipment, customer phone number and payment record in a tenant. Same minimum everywhere now.
  try {
    assertPasswordStrength(password);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "كلمة المرور غير صالحة" };
  }

  const userType = String(formData.get("userType")) as "COMPANY_USER" | "DRIVER";
  const roleId = String(formData.get("roleId") || "");
  const branchId = String(formData.get("branchId") || "");
  if (!roleId) return { error: "الدور الوظيفي مطلوب" };

  try {
    await createEmployee({
      companyId: user.companyId!,
      branchScope: getBranchScope(user),
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      phone: String(formData.get("phone") || ""),
      password,
      roleId,
      branchId: branchId || undefined,
      userType,
    });
  } catch (e) {
    if (isDuplicateEmail(e)) return { error: "البريد الإلكتروني مستخدم من قبل موظف آخر" };
    return { error: "تعذّر إنشاء الموظف" };
  }

  revalidatePath("/app/employees");
}

export async function updateEmployeeAction(userId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "employees", "edit");

  const roleId = String(formData.get("roleId") || "");
  if (!roleId) return { error: "الدور الوظيفي مطلوب" };
  if (userId === user.id && roleId !== user.roleId) {
    return { error: "لا يمكنك تعديل دورك الوظيفي الخاص بنفسك" };
  }

  // A branch-scoped editor's form never renders the branch field (they can't move someone out of
  // their own branch) — absent means "leave unchanged", not "clear the branch".
  const branchId = formData.has("branchId") ? String(formData.get("branchId") || "") || null : undefined;

  try {
    await updateEmployee(
      user.companyId!,
      userId,
      {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        phone: String(formData.get("phone") || "").trim() || undefined,
        roleId,
        branchId,
      },
      getBranchScope(user)
    );
  } catch (e) {
    if (isDuplicateEmail(e)) return { error: "البريد الإلكتروني مستخدم من قبل موظف آخر" };
    if (e instanceof Error && e.message.startsWith("FORBIDDEN")) return { error: "لا تملك صلاحية تعديل موظف خارج فرعك" };
    return { error: "تعذّر حفظ التعديلات" };
  }

  revalidatePath("/app/employees");
  revalidatePath(`/app/employees/${userId}`);
}

/**
 * Issues a one-time reset link for an employee and returns it to the admin who asked for it.
 *
 * The link is returned, not emailed or messaged: this product has no outbound mail channel, and the
 * office already has the person's WhatsApp — or is standing next to them. The admin never sees or
 * chooses a password, so "the manager knows everyone's password" never becomes true.
 *
 * Authorized exactly like editing that employee: same company, same branch scope, employees.edit.
 * Reusing that boundary is the point — anyone who can already change an employee's role or email
 * can hand them a way back into their own account, and nobody else can.
 */
export async function resetEmployeePasswordAction(userId: string) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "employees", "edit");

    const target = await prisma.user.findFirst({
      where: { id: userId, companyId: user.companyId!, userType: { in: ["COMPANY_USER", "DRIVER"] } },
    });
    if (!target) throw new Error("الموظف غير موجود");
    assertBranchMatch(getBranchScope(user), target.branchId);

    const { token, expiresAt } = await createPasswordReset(target.id, user.id);
    return { url: resetUrlFor(token), expiresAt: expiresAt.toISOString(), name: target.name };
  }, "تعذّر إصدار رابط إعادة التعيين");
}

export async function toggleEmployeeStatusAction(userId: string, status: "ACTIVE" | "DISABLED") {
  const user = await requireCompanyUser();
  assertCan(user, "employees", "disable");
  await updateEmployeeStatus(user.companyId!, userId, status, getBranchScope(user));
  revalidatePath("/app/employees");
  revalidatePath(`/app/employees/${userId}`);
}
