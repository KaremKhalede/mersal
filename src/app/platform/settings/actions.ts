"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PLATFORM_ID } from "@/lib/platform";

export async function updatePlatformSettingsAction(formData: FormData) {
  await requirePlatformAdmin();

  await prisma.platform.update({
    where: { id: PLATFORM_ID },
    data: {
      name: String(formData.get("name")),
      feePerCartonYER: Number(formData.get("feePerCartonYER")),
      whatsappSenderName: String(formData.get("whatsappSenderName")),
    },
  });

  revalidatePath("/platform/settings");
}
