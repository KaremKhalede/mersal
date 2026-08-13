"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createEmployee, updateEmployeeStatus } from "@/modules/users/service";
import { assertCan } from "@/lib/rbac";

export async function createEmployeeAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "employees", "create");

  const userType = String(formData.get("userType")) as "COMPANY_USER" | "DRIVER";
  const roleId = String(formData.get("roleId") || "");
  const branchId = String(formData.get("branchId") || "");

  try {
    await createEmployee({
      companyId: user.companyId!,
      name: String(formData.get("name")),
      email: String(formData.get("email")),
      phone: String(formData.get("phone") || ""),
      password: String(formData.get("password")),
      roleId: roleId || undefined,
      branchId: branchId || undefined,
      userType,
      employeeCode: String(formData.get("employeeCode") || ""),
    });
  } catch {
    return { error: "تعذّر إنشاء الموظف — تأكد أن البريد الإلكتروني غير مستخدم" };
  }

  revalidatePath("/app/employees");
}

export async function toggleEmployeeStatusAction(userId: string, status: "ACTIVE" | "DISABLED") {
  const user = await requireCompanyUser();
  assertCan(user, "employees", "disable");
  await updateEmployeeStatus(user.companyId!, userId, status);
  revalidatePath("/app/employees");
}
