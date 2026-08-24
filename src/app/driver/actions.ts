"use server";

import { revalidatePath } from "next/cache";
import { requireDriver } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { confirmBulkLoad, confirmBulkUnload, arriveAtStop, departStop, completeTrip, reportPartialArrival, assertDriverTripStop } from "@/modules/trips/service";
import { raiseException } from "@/modules/shipments/service";
import { actionResult, type ActionError } from "@/lib/action-result";
import type { ExceptionType } from "@/lib/enums";

/**
 * Every action here returns its failure as data rather than throwing.
 *
 * The driver is the user with the least room to recover: a phone, a weak connection, and a truck
 * at a branch or a border. A thrown Server Action error reaches them in production as an opaque
 * digest — so "لا يمكن إنهاء الرحلة قبل تفريغ جميع الشحنات" became "حدث خطأ غير متوقع", which tells
 * them nothing about the fact that they still have cartons to unload. Routing through
 * actionResult() keeps the real Arabic reason (see src/lib/action-result.ts for the safety rule).
 */

async function assertOwnTrip(userId: string, tripId: string) {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, driverId: userId } });
  if (!trip) throw new Error("هذه الرحلة ليست ضمن رحلاتك");
  return trip;
}

export async function driverConfirmLoadAction(tripId: string, stopId: string) {
  return actionResult(async () => {
    const user = await requireDriver();
    await assertDriverTripStop(user.id, tripId, stopId);
    const result = await confirmBulkLoad(stopId, user.id);
    revalidatePath(`/driver/trip/${tripId}`);
    return result;
  }, "تعذّر تأكيد التحميل");
}

export async function driverConfirmUnloadAction(tripId: string, stopId: string, formData: FormData) {
  return actionResult(async () => {
    const user = await requireDriver();
    await assertDriverTripStop(user.id, tripId, stopId);
    const result = await confirmBulkUnload(stopId, user.id, formData.getAll("missingCartonIds").map(String));
    revalidatePath(`/driver/trip/${tripId}`);
    return result;
  }, "تعذّر تأكيد التفريغ");
}

export async function driverArriveStopAction(tripId: string, stopId: string): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireDriver();
    await assertDriverTripStop(user.id, tripId, stopId);
    await arriveAtStop(tripId, stopId, user.id);
    revalidatePath(`/driver/trip/${tripId}`);
    revalidatePath("/driver");
  }, "تعذّر تسجيل الوصول إلى المحطة");
  return result ?? undefined;
}

export async function driverDepartStopAction(tripId: string, stopId: string): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireDriver();
    await assertDriverTripStop(user.id, tripId, stopId);
    await departStop(tripId, stopId, user.id);
    revalidatePath(`/driver/trip/${tripId}`);
  }, "تعذّر تسجيل مغادرة المحطة");
  return result ?? undefined;
}

export async function driverCompleteTripAction(tripId: string): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireDriver();
    const trip = await assertOwnTrip(user.id, tripId);
    await completeTrip(tripId, trip.companyId, user.id);
    revalidatePath(`/driver/trip/${tripId}`);
    revalidatePath("/driver");
  }, "تعذّر إنهاء الرحلة");
  return result ?? undefined;
}

export async function reportProblemAction(formData: FormData): Promise<ActionError | void> {
  const result = await actionResult(async () => {
    const user = await requireDriver();
    // `|| ""`: formData.get returns null for an absent key and String(null) is "null" — truthy, so
    // the guard below would wave it through and the driver would get "هذه الشحنة ليست ضمن رحلتك"
    // (a permission-sounding message) for a shipment they simply had not picked yet. The Select's
    // `required` used to hide this by blocking the submit — silently, since it sat on Radix's
    // aria-hidden proxy, which Chrome cannot focus.
    const shipmentId = String(formData.get("shipmentId") || "");
    const problemType = String(formData.get("problemType"));
    const note = String(formData.get("note") || "");

    if (!shipmentId) throw new Error("اختر الشحنة المراد الإبلاغ عنها");

    // A driver may only report on a shipment that is actually on one of their own trips —
    // otherwise any driver could mark an arbitrary shipment (any company's) as an exception.
    const link = await prisma.tripShipmentStop.findFirst({ where: { shipmentId, trip: { driverId: user.id } } });
    if (!link) throw new Error("هذه الشحنة ليست ضمن رحلتك");

    if (!problemType || problemType === "null") throw new Error("اختر نوع المشكلة");

    // The two reports that are claims about where the cargo physically is, checked against what the
    // trip actually records. The form already offers only the applicable ones per shipment; this is
    // the same rule on the server, so a stale page cannot post "كرتون ناقص" about boxes that never
    // left the origin branch — which would mark cartons MISSING that nobody has yet touched.
    if (problemType === "MISSING_CARTON" && !link.loadedAt) throw new Error("لم تُحمّل هذه الشحنة بعد — لا يمكن الإبلاغ عن كرتون ناقص");
    if (problemType === "NOT_LOADED" && link.loadedAt) throw new Error("هذه الشحنة محمّلة بالفعل");

    if (problemType === "MISSING_CARTON") {
      // Named cartons, not a count: the driver is standing in front of the boxes and knows which
      // one is absent, and a count would send the service back to guessing identity by index.
      const missingCartonIds = formData.getAll("missingCartonIds").map(String);
      if (missingCartonIds.length === 0) throw new Error("حدد الكرتون المفقود");
      await reportPartialArrival(shipmentId, missingCartonIds, user.id, note || "تم الإبلاغ عن نقص من السائق");
    } else {
      await raiseException(shipmentId, problemType as ExceptionType, note || undefined, user.id);
    }

    revalidatePath("/driver");
  }, "تعذّر إرسال البلاغ");
  return result ?? undefined;
}
