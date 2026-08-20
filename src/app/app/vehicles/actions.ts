"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { createVehicle, updateVehicle, toggleVehicleActive } from "@/modules/vehicles/service";
import { assertCan } from "@/lib/rbac";
import { VEHICLE_TYPES } from "@/lib/enums";
import { Prisma } from "@prisma/client";

function isDuplicatePlate(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && (e.meta?.target as string[] | undefined)?.includes("plateNumber");
}

function validType(raw: string): string | undefined {
  return (VEHICLE_TYPES as readonly string[]).includes(raw) ? raw : undefined;
}

export async function createVehicleAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "vehicles", "create");

  const plateNumber = String(formData.get("plateNumber") || "").trim();
  const type = validType(String(formData.get("type") || ""));
  if (!plateNumber) return { error: "رقم اللوحة مطلوب" };
  if (!type) return { error: "نوع المركبة مطلوب" };

  try {
    await createVehicle({
      companyId: user.companyId!,
      plateNumber,
      type,
      notes: String(formData.get("notes") || "").trim() || undefined,
    });
  } catch (e) {
    if (isDuplicatePlate(e)) return { error: "رقم اللوحة مستخدم من قبل مركبة أخرى في الشركة" };
    return { error: "تعذّر إضافة المركبة" };
  }

  revalidatePath("/app/vehicles");
}

export async function updateVehicleAction(vehicleId: string, formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "vehicles", "edit");

  const plateNumber = String(formData.get("plateNumber") || "").trim();
  const type = validType(String(formData.get("type") || ""));
  if (!plateNumber) return { error: "رقم اللوحة مطلوب" };
  if (!type) return { error: "نوع المركبة مطلوب" };

  try {
    await updateVehicle(user.companyId!, vehicleId, {
      plateNumber,
      type,
      notes: String(formData.get("notes") || "").trim() || null,
    });
  } catch (e) {
    if (isDuplicatePlate(e)) return { error: "رقم اللوحة مستخدم من قبل مركبة أخرى في الشركة" };
    return { error: "تعذّر حفظ التعديلات" };
  }

  revalidatePath("/app/vehicles");
  revalidatePath(`/app/vehicles/${vehicleId}`);
}

export async function toggleVehicleActiveAction(vehicleId: string, isActive: boolean) {
  const user = await requireCompanyUser();
  assertCan(user, "vehicles", "disable");
  await toggleVehicleActive(user.companyId!, vehicleId, isActive);
  revalidatePath("/app/vehicles");
  revalidatePath(`/app/vehicles/${vehicleId}`);
}
