"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform } from "@/lib/rbac";
import { createCompany, setCompanyStatus, listPlatformCompaniesForExport, type CompanyPeriod } from "@/modules/companies/service";
import { createPasswordReset, resetUrlFor } from "@/modules/users/password-reset";
import { assertPasswordStrength } from "@/lib/password";
import { actionResult } from "@/lib/action-result";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";

export async function createCompanyAction(formData: FormData) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "companies", "manage");

  const name = String(formData.get("name"));
  const slug = String(formData.get("slug")).trim().toLowerCase().replace(/\s+/g, "-");

  // This account is the tenant's owner — the single most privileged login in that company.
  try {
    assertPasswordStrength(String(formData.get("adminPassword") || ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "كلمة المرور غير صالحة" };
  }

  try {
    await createCompany({
      name,
      slug,
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || ""),
      adminName: String(formData.get("adminName")),
      adminEmail: String(formData.get("adminEmail")),
      adminPassword: String(formData.get("adminPassword")),
    });
  } catch {
    return { error: "تعذّر إنشاء الشركة — تأكد أن المعرف والبريد الإلكتروني غير مستخدمين" };
  }

  revalidatePath("/platform/companies");
}

/**
 * One-time reset link for a company account, issued by the platform.
 *
 * This is the case the company-side reset cannot cover: when the locked-out person IS the company
 * admin, there is nobody inside the tenant with the authority to help them. Without this, the only
 * recovery for a pilot office that loses its owner password is a manual database write.
 *
 * Scoped to users of the named company, so a `companies.manage` operator can never point it at a
 * platform account — those are resetPlatformUserPasswordAction's, behind `platformUsers.manage`.
 */
export async function resetCompanyUserPasswordAction(companyId: string, userId: string) {
  return actionResult(async () => {
    const me = await requirePlatformAdmin();
    assertCanPlatform(me, "companies", "manage");

    const target = await prisma.user.findFirst({
      where: { id: userId, companyId, userType: { in: ["COMPANY_USER", "DRIVER"] } },
    });
    if (!target) throw new Error("الحساب غير موجود");

    const { token, expiresAt } = await createPasswordReset(target.id, me.id);
    return { url: resetUrlFor(token), expiresAt: expiresAt.toISOString(), name: target.name };
  }, "تعذّر إصدار رابط إعادة التعيين");
}

export async function toggleCompanyStatusAction(companyId: string, status: "ACTIVE" | "SUSPENDED") {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "companies", "manage");
  await setCompanyStatus(companyId, status);
  revalidatePath("/platform/companies");
}

/**
 * Platform-side edit of a tenant's contact details — support staff correcting a phone or email
 * without impersonating the company. Deliberately limited to identity/contact: nothing here can
 * touch billing, status, or anything the company itself owns in /app/settings/company.
 */
export async function updateCompanyProfileAction(companyId: string, formData: FormData) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "companies", "manage");

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "اسم الشركة مطلوب" };

  const email = String(formData.get("email") || "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "صيغة البريد الإلكتروني غير صحيحة" };

  try {
    await prisma.company.update({
      where: { id: companyId },
      data: { name, phone: String(formData.get("phone") || "").trim() || null, email: email || null },
    });
  } catch {
    return { error: "تعذّر حفظ التعديلات" };
  }

  revalidatePath(`/platform/companies/${companyId}`);
  revalidatePath("/platform/companies");
}

export async function exportCompaniesCsvAction(params: { search?: string; status?: string; period?: CompanyPeriod }) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "companies", "view");
  const items = await listPlatformCompaniesForExport(params);

  const header = ["الشركة", "المعرف", "الحالة", "الكراتين هذا الشهر", "المستحق (ر.ي)", "تاريخ التسجيل", "آخر نشاط"];
  const rows = items.map((c) => [
    c.name,
    c.slug,
    c.status === "ACTIVE" ? "نشطة" : "متوقفة",
    String(c.cartonsThisMonth),
    c.outstanding.toFixed(2),
    c.createdAt.toISOString().slice(0, 10),
    c.lastActivity ? c.lastActivity.toISOString().slice(0, 10) : "—",
  ]);
  return toCsv(header, rows);
}
