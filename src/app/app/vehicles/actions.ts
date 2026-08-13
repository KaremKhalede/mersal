"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createVehicle, toggleVehicleActive } from "@/modules/vehicles/service";
import { assertCan } from "@/lib/rbac";

export async function createVehicleAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "vehicles", "create");

  const type = String(formData.get("type") || "").trim();
  await createVehicle({
    companyId: user.companyId!,
    plateNumber: String(formData.get("plateNumber")).trim(),
    type: type || undefined,
  });

  revalidatePath("/app/vehicles");
}

export async function toggleVehicleActiveAction(vehicleId: string, isActive: boolean) {
  const user = await requireCompanyUser();
  assertCan(user, "vehicles", "edit");
  await toggleVehicleActive(user.companyId!, vehicleId, isActive);
  revalidatePath("/app/vehicles");
}
