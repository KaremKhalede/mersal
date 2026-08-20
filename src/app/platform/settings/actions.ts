"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PLATFORM_ID } from "@/lib/platform";
import { actionResult } from "@/lib/action-result";

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

    await prisma.platform.update({
      where: { id: PLATFORM_ID },
      data: {
        name,
        feePerCartonYER: fee,
        whatsappSenderName: String(formData.get("whatsappSenderName") || "").trim(),
      },
    });

    revalidatePath("/platform/settings");
  }, "تعذّر حفظ الإعدادات");

  if (result && "error" in result) return result;
  return { success: "تم حفظ الإعدادات" };
}
