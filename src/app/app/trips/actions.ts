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
  arriveAtStop,
  departStop,
  completeTrip,
  assertTripInCompany,
  assertStopInCompany,
  suggestShipmentsForStops,
  assignTripCrew,
  cancelTrip,
  unassignShipmentFromTrip,
  type CreateTripStopInput,
} from "@/modules/trips/service";
import { findOrCreateVehicle } from "@/modules/vehicles/service";
import { assertCan } from "@/lib/rbac";
import { actionResult, type ActionError } from "@/lib/action-result";

export async function createTripAction(formData: FormData) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "create");

  const branchIds = formData.getAll("stopBranchId").map(String);
  const loading = formData.getAll("stopLoading").map(String);
  const unloading = formData.getAll("stopUnloading").map(String);
  // One "stopPlannedArrival" datetime-local input per stop row, always present (possibly empty) —
  // positionally aligned with branchIds, same as every other per-stop field here.
  const plannedArrivals = formData.getAll("stopPlannedArrival").map(String);

  // Row count comes from plannedArrivals, not branchIds: that input is a plain <input> and is
  // always submitted (possibly empty), one per stop, while a Select left on its placeholder may or
  // may not contribute a FormData entry at all. Counting the Selects therefore cannot tell "one
  // stop" apart from "two stops, neither chosen" — and those need different words.
  //
  // This is the only check left guarding a blank stop now that `required` is off the Select (it sat
  // on Radix's aria-hidden native proxy, which Chrome refuses to focus, so it silently blocked the
  // submit and said nothing). Nothing that was accepted before is rejected now, and nothing that
  // was rejected is accepted — only the message changes, from "فرع غير صالح" to what to do.
  if (plannedArrivals.length < 2) return { error: "الرحلة تحتاج محطتين على الأقل" };
  if (branchIds.length !== plannedArrivals.length || branchIds.some((id) => !id)) {
    return { error: "اختر فرعاً لكل محطة في الرحلة" };
  }

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

  // Shipments the "new trip" page's suggestion panel had checked, if any — same
  // autoAssignShipmentToTrip call the per-stop dialog uses, so the exact same route/status/
  // not-elsewhere-active rules apply. A shipment that lost its eligibility between the suggestion
  // being shown and this submit (e.g. another tab just claimed it) is skipped, not fatal — the
  // trip itself is already created and valid without it.
  const shipmentIds = formData.getAll("shipmentIds").map(String);
  let assignedCount = 0;
  for (const shipmentId of shipmentIds) {
    try {
      await autoAssignShipmentToTrip(trip.id, shipmentId);
      assignedCount += 1;
    } catch {
      // best-effort — see comment above
    }
  }

  revalidatePath("/app/trips");
  return { tripId: trip.id, assignedCount, skippedCount: shipmentIds.length - assignedCount };
}

/** Shipment suggestions for the "new trip" page's live panel — recomputed client-side whenever the
 * staged stops change, before the trip itself exists. */
export async function suggestShipmentsAction(stops: { branchId: string; loadingEnabled: boolean; unloadingEnabled: boolean }[]) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "create");
  const branchIds = stops.map((s) => s.branchId).filter(Boolean);
  if (branchIds.length < 2) return [];
  const branches = await prisma.branch.findMany({ where: { id: { in: branchIds } } });
  if (branches.some((b) => b.companyId !== user.companyId)) return [];
  return suggestShipmentsForStops(user.companyId!, stops.map((s, i) => ({ ...s, sequence: i + 1 })));
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

/**
 * The stop is re-checked against the caller's company and branch scope before anything is written,
 * so the carton ids in the form can only ever be applied to a stop this employee may act on — a
 * forged id is then rejected again inside confirmBulkUnload for not belonging to that stop.
 */
export async function confirmUnloadAction(tripId: string, stopId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "trips", "edit");
    await assertStopInCompany(user.companyId!, stopId, tripId, getBranchScope(user));
    const result = await confirmBulkUnload(stopId, user.id, formData.getAll("missingCartonIds").map(String));
    revalidatePath(`/app/trips/${tripId}`);
    return result;
  }, "تعذّر تأكيد التفريغ");
}

export async function arriveStopAction(tripId: string, stopId: string) {
  const user = await requireCompanyUser();
  // Same permission and the same exact-branch guard as departing: recording that the truck pulled
  // in is a stop-level edit, and a stop-level action physically happens at one branch.
  assertCan(user, "trips", "edit");
  await assertStopInCompany(user.companyId!, stopId, tripId, getBranchScope(user));
  await arriveAtStop(tripId, stopId, user.id);
  revalidatePath(`/app/trips/${tripId}`);
}

export async function departStopAction(tripId: string, stopId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "edit");
  await assertStopInCompany(user.companyId!, stopId, tripId, getBranchScope(user));
  await departStop(tripId, stopId, user.id);
  revalidatePath(`/app/trips/${tripId}`);
}

/**
 * Sets the trip's driver and vehicle — the write this file has been missing since day one.
 *
 * Gated on `trips.assignDriver`, a permission that has existed in PERMISSION_RESOURCES from the
 * start and was enforced nowhere, because there was nothing to enforce it on. Deciding who drives
 * is a different decision from editing a route, and the role matrix already said so.
 */
export async function assignTripCrewAction(tripId: string, formData: FormData): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "trips", "assignDriver");
    // An empty select means "no one yet", which is a legitimate state to return a trip to.
    const driverId = String(formData.get("driverId") || "") || null;
    const vehicleId = String(formData.get("vehicleId") || "") || null;
    await assignTripCrew({
      companyId: user.companyId!,
      tripId,
      driverId,
      vehicleId,
      userId: user.id,
      branchScope: getBranchScope(user),
    });
    revalidatePath(`/app/trips/${tripId}`);
    revalidatePath("/app/trips");
    // The driver's own screen resolves its trip on every load, so nothing to revalidate there —
    // but the previous driver's page must stop showing a trip that is no longer theirs.
    revalidatePath("/driver");
  }, "تعذّر تعيين الطاقم");
  return result ?? undefined;
}

export async function cancelTripAction(tripId: string): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "trips", "edit");
    await cancelTrip(user.companyId!, tripId, user.id, getBranchScope(user));
    revalidatePath(`/app/trips/${tripId}`);
    revalidatePath("/app/trips");
    revalidatePath("/driver");
  }, "تعذّر إلغاء الرحلة");
  return result ?? undefined;
}

export async function unassignShipmentAction(tripId: string, linkId: string): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireCompanyUser();
    assertCan(user, "trips", "edit");
    await unassignShipmentFromTrip({
      companyId: user.companyId!,
      tripId,
      linkId,
      userId: user.id,
      branchScope: getBranchScope(user),
    });
    revalidatePath(`/app/trips/${tripId}`);
  }, "تعذّر إزالة الشحنة من الرحلة");
  return result ?? undefined;
}

export async function completeTripAction(tripId: string) {
  const user = await requireCompanyUser();
  assertCan(user, "trips", "complete");
  await assertTripInCompany(user.companyId!, tripId, getBranchScope(user));
  await completeTrip(tripId, user.companyId!, user.id);
  revalidatePath(`/app/trips/${tripId}`);
  revalidatePath("/app/trips");
}
