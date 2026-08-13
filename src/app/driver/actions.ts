"use server";

import { revalidatePath } from "next/cache";
import { requireDriver } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { confirmBulkLoad, confirmBulkUnload, departStop, completeTrip, reportPartialArrival } from "@/modules/trips/service";
import { raiseException } from "@/modules/shipments/service";
import type { ExceptionType } from "@/lib/enums";

async function assertOwnTrip(userId: string, tripId: string) {
  const trip = await prisma.trip.findFirstOrThrow({ where: { id: tripId, driverId: userId } });
  return trip;
}

export async function driverConfirmLoadAction(tripId: string, stopId: string) {
  const user = await requireDriver();
  await assertOwnTrip(user.id, tripId);
  const result = await confirmBulkLoad(stopId, user.id);
  revalidatePath(`/driver/trip/${tripId}`);
  return result;
}

export async function driverConfirmUnloadAction(tripId: string, stopId: string) {
  const user = await requireDriver();
  await assertOwnTrip(user.id, tripId);
  const result = await confirmBulkUnload(stopId, user.id);
  revalidatePath(`/driver/trip/${tripId}`);
  return result;
}

export async function driverDepartStopAction(tripId: string, stopId: string) {
  const user = await requireDriver();
  await assertOwnTrip(user.id, tripId);
  await departStop(tripId, stopId, user.id);
  revalidatePath(`/driver/trip/${tripId}`);
}

export async function driverCompleteTripAction(tripId: string) {
  const user = await requireDriver();
  const trip = await assertOwnTrip(user.id, tripId);
  await completeTrip(tripId, trip.companyId, user.id);
  revalidatePath(`/driver/trip/${tripId}`);
  revalidatePath("/driver");
}

export async function reportProblemAction(formData: FormData) {
  const user = await requireDriver();
  const shipmentId = String(formData.get("shipmentId"));
  const problemType = String(formData.get("problemType"));
  const note = String(formData.get("note") || "");

  // A driver may only report on a shipment that is actually on one of their own trips —
  // otherwise any driver could mark an arbitrary shipment (any company's) as an exception.
  const link = await prisma.tripShipmentStop.findFirst({
    where: { shipmentId, trip: { driverId: user.id } },
    include: { shipment: true },
  });
  if (!link) throw new Error("هذه الشحنة ليست ضمن رحلتك");
  const shipment = link.shipment;

  if (problemType === "MISSING_CARTON") {
    const arrivedRaw = formData.get("arrivedCartons");
    const arrivedCartons = arrivedRaw ? Math.max(0, Math.min(shipment.totalCartons, Number(arrivedRaw))) : Math.max(0, shipment.totalCartons - 1);
    await reportPartialArrival(shipmentId, arrivedCartons, user.id, note || "تم الإبلاغ عن نقص من السائق");
  } else {
    await raiseException(shipmentId, problemType as ExceptionType, note || undefined, user.id);
  }

  revalidatePath("/driver");
}
