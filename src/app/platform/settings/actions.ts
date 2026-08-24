"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PLATFORM_ID } from "@/lib/platform";
import { actionResult } from "@/lib/action-result";
import { normalizePhone, phoneError } from "@/lib/phone";

export type SettingsState = { error?: string; success?: string };

/**
 * Written for useActionState, so the result is actually rendered.
 *
 * The previous shape — a bare `<form action={updatePlatformSettingsAction}>` on a Server Component
 * — discards whatever the action returns, so any failure was invisible: the page simply re-rendered
 * with the old values and no explanation. That matters more here than almost anywhere else in the
 * product, because this form sets the per-carton fee that every invoice in the system is computed
 * from.
 *
 * The fee is validated explicitly rather than left to `Number(...)`: an empty or non-numeric field
 * would otherwise reach Prisma as NaN and fail deep in the driver with a message no operator can act
 * on. A negative fee is rejected outright — it would silently credit every company.
 */
export async function updatePlatformSettingsAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const result = await actionResult(async () => {
    const me = await requirePlatformAdmin();
    assertCanPlatform(me, "settings", "manage");

    const name = String(formData.get("name") || "").trim();
    if (!name) throw new Error("اسم المنصة مطلوب");

    const feeRaw = String(formData.get("feePerCartonYER") || "").trim();
    const fee = Number(feeRaw);
    if (!feeRaw || !Number.isFinite(fee)) throw new Error("أدخل رسوم الكرتون كرقم صحيح");
    if (fee < 0) throw new Error("لا يمكن أن تكون رسوم الكرتون بالسالب");

    // Support contact for the public tracking page. Blank is NULL, never "" — /track renders the
    // whole contact band only when at least one of these is set, and an empty string would keep an
    // empty row on a customer-facing screen. Phones go through the product's one phone rule so an
    // unreachable support number cannot be published; a blank one is simply cleared.
    const contact: Record<string, string | null> = {};
    for (const [field, label] of [
      ["supportPhone", "رقم الدعم"],
      ["supportWhatsapp", "رقم واتساب الدعم"],
    ] as const) {
      const raw = String(formData.get(field) || "").trim();
      if (!raw) {
        contact[field] = null;
        continue;
      }
      const problem = phoneError(raw, label);
      if (problem) throw new Error(problem);
      contact[field] = normalizePhone(raw);
    }
    const supportEmail = String(formData.get("supportEmail") || "").trim();
    if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
      throw new Error("بريد الدعم غير صالح");
    }

    await prisma.platform.update({
      where: { id: PLATFORM_ID },
      data: {
        name,
        feePerCartonYER: fee,
        whatsappSenderName: String(formData.get("whatsappSenderName") || "").trim(),
        ...contact,
        supportEmail: supportEmail || null,
        supportHours: String(formData.get("supportHours") || "").trim() || null,
      },
    });

    revalidatePath("/platform/settings");
    // The public page reads these — it must not keep serving the previous contact band.
    revalidatePath("/track");
  }, "تعذّر حفظ الإعدادات");

  if (result && "error" in result) return result;
  return { success: "تم حفظ الإعدادات" };
}
