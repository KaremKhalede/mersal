"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { createCompany, setCompanyStatus } from "@/modules/companies/service";

export async function createCompanyAction(formData: FormData) {
  await requirePlatformAdmin();

  const name = String(formData.get("name"));
  const slug = String(formData.get("slug")).trim().toLowerCase().replace(/\s+/g, "-");

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

export async function toggleCompanyStatusAction(companyId: string, status: "ACTIVE" | "SUSPENDED") {
  await requirePlatformAdmin();
  await setCompanyStatus(companyId, status);
  revalidatePath("/platform/companies");
}
