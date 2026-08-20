"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertCan } from "@/lib/rbac";
import { documentStorage } from "@/modules/documents/storage";
import { logAudit } from "@/lib/audit";

export type CompanySettingsState = { error?: string; success?: boolean };

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB — matches the hint shown under the upload control
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function text(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

/** Empty optional field -> null, so clearing a value actually clears it instead of storing "". */
function optional(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

export async function updateCompanySettingsAction(
  _prev: CompanySettingsState,
  formData: FormData
): Promise<CompanySettingsState> {
  const user = await requireCompanyUser();
  assertCan(user, "settings", "edit");
  const companyId = user.companyId!;

  const name = text(formData, "name");
  if (!name) return { error: "اسم الشركة بالعربية مطلوب" };

  // Also enforced server-side, not just via the `required` attribute — that one is trivially
  // bypassed by posting the form directly.
  const nameEn = text(formData, "nameEn");
  if (!nameEn) return { error: "اسم الشركة بالإنجليزية مطلوب" };

  const email = text(formData, "email");
  if (!email) return { error: "البريد الإلكتروني مطلوب" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "صيغة البريد الإلكتروني غير صحيحة" };

  const website = optional(formData, "website");
  if (website && !/^https?:\/\/.+/i.test(website)) {
    return { error: "الموقع الإلكتروني يجب أن يبدأ بـ http:// أو https://" };
  }

  // Logo is optional on every save — an empty file input must not wipe the existing logo.
  let logoKey: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = LOGO_TYPES[logo.type];
    if (!ext) return { error: "صيغة الشعار غير مدعومة — استخدم PNG أو JPG أو WEBP" };
    if (logo.size > MAX_LOGO_BYTES) return { error: "حجم الشعار يتجاوز 2 ميجابايت" };

    logoKey = `${companyId}/logo-${Date.now()}.${ext}`;
    try {
      await documentStorage.write(logoKey, Buffer.from(await logo.arrayBuffer()));
    } catch {
      return { error: "تعذّر رفع الشعار" };
    }
  }

  try {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        name,
        nameEn,
        description: optional(formData, "description"),
        phone: optional(formData, "phone"),
        email,
        website,
        address: optional(formData, "address"),
        ...(logoKey ? { logoKey } : {}),
      },
    });
  } catch {
    return { error: "تعذّر حفظ التغييرات" };
  }

  await logAudit({
    companyId,
    userId: user.id,
    action: "UPDATE",
    entityType: "Company",
    entityId: companyId,
  });

  revalidatePath("/app/settings/company");
  revalidatePath("/app");
  return { success: true };
}
