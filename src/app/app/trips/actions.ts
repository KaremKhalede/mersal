"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSameCompany } from "@/lib/tenant";
import { getBranchScope, assertAnyBranchMatch, assertShipmentBranchAccess } from "@/lib/branch-scope";
import { businessLocalInputToDate } from "@/lib/timezone";
import {
  createTrip,
  autoAssignShipmentToTrip,
  confirmBulkLoad,
  confirmBulkUnload,
  departStop,
  completeTrip,
  assertTripInCompany,
  assertStopInCompany,
  type CreateTripStopInput,
} from "@/modules/trips/service";
import { findOrCreateVehicle } from "@/modules/vehicles/service";
import { assertCan } from "@/lib/rbac";

export async function createTripAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "create");

  const branchIds = formData.getAll("stopBranchId").map(String);
  const loading = formData.getAll("stopLoading").map(String);
  const unloading = formData.getAll("stopUnloading").map(String);
  // One "stopPlannedArrival" datetime-local input per stop row, always present (possibly empty) —
  // positionally aligned with branchIds, same as every other per-stop field here.
  const plannedArrivals = formData.getAll("stopPlannedArrival").map(String);

  if (branchIds.length < 2) return { error: "الرحلة تحتاج محطتين على الأقل" };

  const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } } });
  if (branches.some((b) => b.companyId !== user.companyId) || branches.length !== new Set(branchIds).size) {
    return { error: "فرع غير صالح" };
  }
  // A branch-scoped employee may create a multi-stop trip, but it must actually touch their own
  // branch somewhere — otherwise they could plan a route for a branch they have no business in.
  try {
    assertAnyBranchMatch(getBranchScope(user), branchIds);
  } catch {
    return { error: "يجب أن تتضمن الرحلة فرعك" };
  }

  const stops: CreateTripStopInput[] = branchIds.map((branchId, i) => ({
    branchId,
    sequence: i + 1,
    loadingEnabled: loading.includes(String(i)),
    unloadingEnabled: unloading.includes(String(i)),
    plannedArrival: businessLocalInputToDate(plannedArrivals[i]),
  }));

  const driverId = String(formData.get("driverId") || "");
  if (driverId) {
    const driver = await prisma.user.findUnique({ where: { id: driverId } });
    if (driver?.companyId !== user.companyId || driver.userType !== "DRIVER") return { error: "سائق غير صالح" };
  }

  const plateNumber = String(formData.get("vehiclePlate") || "").trim();
  const vehicle = plateNumber ? await findOrCreateVehicle({ companyId: user.companyId!, plateNumber }) : undefined;

  const trip = await createTrip({
    companyId: user.companyId!,
    vehicleId: vehicle?.id,
    driverId: driverId || undefined,
    stops,
    userId: user.id,
  });

  revalidatePath("/app/trips");
  return { tripId: trip.id };
}

export async function assignShipmentAction(tripId: string, shipmentId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "edit");
  const branchScope = getBranchScope(user);
  await assertTripInCompany(user.companyId!, tripId, branchScope);
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany(user, shipment.companyId);
  assertShipmentBranchAccess(branchScope, shipment);
  try {
    await autoAssignShipmentToTrip(tripId, shipmentId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "تعذّر ربط الشحنة بالرحلة" };
  }
  revalidatePath(`/app/trips/${tripId}`);
}

export async function confirmLoadAction(tripId: string, stopId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "edit");
  await assertStopInCompany(user.companyId!, stopId, tripId, getBranchScope(user));
  const result = await confirmBulkLoad(stopId, user.id);
  revalidatePath(`/app/trips/${tripId}`);
  return result;
}

export async function confirmUnloadAction(tripId: string, stopId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "edit");
  await assertStopInCompany(user.companyId!, stopId, tripId, getBranchScope(user));
  const result = await confirmBulkUnload(stopId, user.id);
  revalidatePath(`/app/trips/${tripId}`);
  return result;
}

export async function departStopAction(tripId: string, stopId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "edit");
  await assertStopInCompany(user.companyId!, stopId, tripId, getBranchScope(user));
  await departStop(tripId, stopId, user.id);
  revalidatePath(`/app/trips/${tripId}`);
}

export async function completeTripAction(tripId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "complete");
  await assertTripInCompany(user.companyId!, tripId, getBranchScope(user));
  await completeTrip(tripId, user.companyId!, user.id);
  revalidatePath(`/app/trips/${tripId}`);
  revalidatePath("/app/trips");
}
