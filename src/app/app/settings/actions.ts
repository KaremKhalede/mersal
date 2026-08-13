"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertCan } from "@/lib/rbac";

export async function updateCompanySettingsAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "settings", "edit");

  await prisma.company.update({
    where: { id: user.companyId! },
    data: {
      name: String(formData.get("name")),
      phone: String(formData.get("phone") || ""),
      email: String(formData.get("email") || ""),
      logoColor: String(formData.get("logoColor") || "#1e3a8a"),
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app");
}
