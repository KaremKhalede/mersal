import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil, expectNotFound } from "./helpers";
import { completeTrip, confirmBulkLoad, confirmBulkUnload, departStop, autoAssignShipmentToTrip, getUnassignedShipmentsForStop } from "@/modules/trips/service";
import { raiseException, resolveException } from "@/modules/shipments/service";
import { exceptionRecoveryTargets } from "@/modules/shipments/state-machine";

/**
 * P0-5 and P0-6: two ways a record could get stuck with no way out.
 *
 * P0-5 — "still on a truck" was asked as `unloadedAt: null`, which is also true of a shipment that
 * was merely planned onto a trip and never loaded. That one link made the trip impossible to
 * complete AND made the shipment impossible to put on any other trip, forever, while the UI showed
 * the complete button as available.
 *
 * P0-6 — resolving an exception returns a shipment to the status it held before, and three of those
 * statuses were not reachable from EXCEPTION, so the resolve button threw and the only working
 * option left was cancelling the shipment.
 */

async function tripWithTwoShipments() {
  const tenant = await createTestTenant(["الرياض", "المكلا"]);
  const [origin, destination] = tenant.branches;
  const trip = await createTestTrip({
    companyId: tenant.company.id,
    driverId: tenant.driverId,
    stops: [
      { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
      { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
    ],
  });
  const [loadStop, unloadStop] = trip.stops;
  const make = async (cartonCount: number) => {
    const s = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: origin.id,
      unloadBranchId: destination.id,
      cartonCount,
      status: "READY_FOR_LOADING",
    });
    await linkShipmentToTrip(trip.id, s.id, loadStop.id, unloadStop.id);
    return s;
  };
  return { tenant, trip, loadStop, unloadStop, origin, destination, make };
}

test.describe("P0-5 — trip completion", () => {
  test("a trip whose cargo was all loaded and unloaded completes", async () => {
    const { tenant, trip, loadStop, unloadStop, make } = await tripWithTwoShipments();
    await make(2);

    await confirmBulkLoad(loadStop.id);
    await departStop(trip.id, loadStop.id);
    await confirmBulkUnload(unloadStop.id, undefined, []);

    await expect(completeTrip(trip.id, tenant.company.id)).resolves.not.toThrow();
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe("COMPLETED");

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment that was never loaded does not block completion", async () => {
    const { tenant, trip, loadStop, unloadStop, make } = await tripWithTwoShipments();
    const travelled = await make(2);
    const leftBehind = await make(3);

    // Only one of the two is actually put on the truck.
    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id, shipmentId: travelled.id },
      data: { loadedAt: new Date(), cartonsLoaded: 2 },
    });
    await prisma.shipment.update({ where: { id: travelled.id }, data: { status: "IN_TRANSIT" } });
    await confirmBulkUnload(unloadStop.id, undefined, []);

    await expect(completeTrip(trip.id, tenant.company.id)).resolves.not.toThrow();

    // The one left behind never moved: its status, and its link, say so.
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: leftBehind.id } });
    expect(db.status).toBe("READY_FOR_LOADING");
    const link = await prisma.tripShipmentStop.findFirstOrThrow({ where: { tripId: trip.id, shipmentId: leftBehind.id } });
    expect(link.loadedAt).toBeNull();
    expect(link.unloadedAt).toBeNull();
    expect(link.cartonsLoaded).toBe(0);
    // No tracking event ever claimed it travelled.
    expect(await prisma.trackingEvent.count({ where: { shipmentId: leftBehind.id, eventType: "IN_TRANSIT" } })).toBe(0);
    void loadStop;

    await cleanupTenant(tenant.company.id);
  });

  test("cargo actually on the truck still blocks completion", async () => {
    const { tenant, trip, loadStop, make } = await tripWithTwoShipments();
    await make(2);
    await confirmBulkLoad(loadStop.id);

    await expect(completeTrip(trip.id, tenant.company.id)).rejects.toThrow(/قبل تفريغ جميع الشحنات/);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).not.toBe("COMPLETED");

    await cleanupTenant(tenant.company.id);
  });

  test("after the trip closes, the shipment left behind can join another trip", async () => {
    const { tenant, trip, unloadStop, origin, destination, make } = await tripWithTwoShipments();
    const leftBehind = await make(3);
    await confirmBulkUnload(unloadStop.id, undefined, []);
    await completeTrip(trip.id, tenant.company.id);

    // It shows up as eligible again — the old link no longer counts as "riding a trip".
    const trip2 = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const eligible = await getUnassignedShipmentsForStop(tenant.company.id, trip2.id, origin.id);
    expect(eligible.map((s) => s.id)).toContain(leftBehind.id);

    await expect(autoAssignShipmentToTrip(trip2.id, leftBehind.id)).resolves.toBeTruthy();

    // Both links survive: the old one records that it was once planned onto the first trip, the new
    // one is the live assignment. Nothing was deleted to make room.
    const links = await prisma.tripShipmentStop.findMany({ where: { shipmentId: leftBehind.id } });
    expect(links).toHaveLength(2);
    expect(links.filter((l) => l.tripId === trip.id)[0].loadedAt).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment genuinely riding another trip is still refused", async () => {
    const { tenant, loadStop, origin, destination, make } = await tripWithTwoShipments();
    const onboard = await make(2);
    await confirmBulkLoad(loadStop.id);

    const trip2 = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await expect(autoAssignShipmentToTrip(trip2.id, onboard.id)).rejects.toThrow(/مرتبطة برحلة أخرى/);
    const eligible = await getUnassignedShipmentsForStop(tenant.company.id, trip2.id, origin.id);
    expect(eligible.map((s) => s.id)).not.toContain(onboard.id);

    await cleanupTenant(tenant.company.id);
  });

  test("a completed trip accepts no further stop operations", async () => {
    const { tenant, trip, loadStop, unloadStop, make } = await tripWithTwoShipments();
    await make(2);
    await confirmBulkUnload(unloadStop.id, undefined, []);
    await completeTrip(trip.id, tenant.company.id);

    // Completing while a planned shipment was never loaded is now legal, so "the trip is over" has
    // to actually close its stops — otherwise cargo could be loaded onto a truck that came back.
    await expect(confirmBulkLoad(loadStop.id)).rejects.toThrow(/منتهية/);
    await expect(confirmBulkUnload(unloadStop.id, undefined, [])).rejects.toThrow(/منتهية/);
    await expect(departStop(trip.id, loadStop.id)).rejects.toThrow(/منتهية/);

    await cleanupTenant(tenant.company.id);
  });

  test("UI and server agree: the complete button is live exactly when the server would allow it", async ({ page }) => {
    const { tenant, trip, unloadStop, make } = await tripWithTwoShipments();
    await make(3); // planned, never loaded
    await confirmBulkUnload(unloadStop.id, undefined, []);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    const complete = page.locator('button:has-text("إنهاء الرحلة")');
    await expect(complete).toBeEnabled();
    await complete.click();

    await pollUntil(
      () => prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }),
      (t) => t.status === "COMPLETED"
    );
    // And the stop actions are gone from a finished trip.
    await page.reload();
    await expect(page.locator('button:has-text("تأكيد التحميل")')).toHaveCount(0);
    await expect(page.locator('button:has-text("تأكيد التفريغ")')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("company and branch isolation on trip completion is unchanged", async ({ page }) => {
    const { tenant, trip, unloadStop, make } = await tripWithTwoShipments();
    await make(2);
    await confirmBulkUnload(unloadStop.id, undefined, []);
    const outsider = await createTestTenant();

    await expect(completeTrip(trip.id, outsider.company.id)).rejects.toThrow();
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).not.toBe("COMPLETED");

    await login(page, outsider.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);
    await expectNotFound(page, [trip.tripNumber]);

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("driver authorization: another company's driver cannot finish this trip", async ({ page }) => {
    const { tenant, trip, unloadStop, make } = await tripWithTwoShipments();
    await make(2);
    await confirmBulkUnload(unloadStop.id, undefined, []);
    const outsider = await createTestTenant();

    await login(page, outsider.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);
    await expectNotFound(page, [trip.tripNumber]);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).not.toBe("COMPLETED");

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });
});

test.describe("P0-6 — exception recovery", () => {
  async function shipmentAt(status: string, statusBefore?: string) {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 3,
      status,
    });
    if (statusBefore) {
      await prisma.shipment.update({
        where: { id: shipment.id },
        data: { status: "EXCEPTION", statusBeforeException: statusBefore, exceptionType: "OTHER" },
      });
    }
    return { tenant, shipment };
  }

  test("an exception raised on a partially arrived shipment can be resolved back", async () => {
    const { tenant, shipment } = await shipmentAt("PARTIALLY_ARRIVED");
    await raiseException(shipment.id, "MISSING_CARTON", "نقص كرتون");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("EXCEPTION");

    // The default recovery — the button an employee actually presses — used to throw here.
    await expect(resolveException(shipment.id)).resolves.toBeTruthy();
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("PARTIALLY_ARRIVED");
    expect(db.exceptionType).toBeNull();
    expect(db.statusBeforeException).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("a partially arrived shipment can also be resolved straight to pickup", async () => {
    const { tenant, shipment } = await shipmentAt("PARTIALLY_ARRIVED");
    await raiseException(shipment.id, "MISSING_CARTON", undefined);

    await resolveException(shipment.id, undefined, "READY_FOR_PICKUP");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(tenant.company.id);
  });

  test("a delivery-requested shipment recovers, or falls back to branch pickup", async () => {
    const { tenant, shipment } = await shipmentAt("ARRIVED", "DELIVERY_REQUESTED");
    await expect(resolveException(shipment.id)).resolves.toBeTruthy();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("DELIVERY_REQUESTED");

    const second = await shipmentAt("ARRIVED", "DELIVERY_REQUESTED");
    await resolveException(second.shipment.id, undefined, "READY_FOR_PICKUP");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: second.shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(second.tenant.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("an out-for-delivery shipment can retry the delivery or return to the counter", async () => {
    const { tenant, shipment } = await shipmentAt("ARRIVED", "OUT_FOR_DELIVERY");
    await expect(resolveException(shipment.id)).resolves.toBeTruthy();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("OUT_FOR_DELIVERY");

    const second = await shipmentAt("ARRIVED", "OUT_FOR_DELIVERY");
    await resolveException(second.shipment.id, undefined, "READY_FOR_PICKUP");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: second.shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(second.tenant.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("a shipment that never arrived cannot be moved to out-for-delivery", async () => {
    const { tenant, shipment } = await shipmentAt("ARRIVED", "IN_TRANSIT");

    // The exact nonsense the flat transition map would have allowed once the new edges were added.
    await expect(resolveException(shipment.id, undefined, "OUT_FOR_DELIVERY")).rejects.toThrow(/لا يمكن إعادة الشحنة/);
    await expect(resolveException(shipment.id, undefined, "DELIVERY_REQUESTED")).rejects.toThrow(/لا يمكن إعادة الشحنة/);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("EXCEPTION");

    // What it may do is carry on, or be recorded as arrived — in full or short.
    await expect(resolveException(shipment.id, undefined, "PARTIALLY_ARRIVED")).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("the recovery rules never offer a status the shipment could skip a stage to reach", async () => {
    // Nothing before an arrival may reach a post-arrival stage.
    for (const before of ["RECEIVED", "READY_FOR_LOADING", "LOADED", "IN_TRANSIT"] as const) {
      const targets = exceptionRecoveryTargets(before);
      expect(targets).not.toContain("READY_FOR_PICKUP");
      expect(targets).not.toContain("DELIVERY_REQUESTED");
      expect(targets).not.toContain("OUT_FOR_DELIVERY");
      expect(targets).not.toContain("DELIVERED");
    }
    // Every set can undo itself and every set can be written off.
    for (const before of ["RECEIVED", "LOADED", "IN_TRANSIT", "PARTIALLY_ARRIVED", "ARRIVED", "READY_FOR_PICKUP", "DELIVERY_REQUESTED", "OUT_FOR_DELIVERY"] as const) {
      expect(exceptionRecoveryTargets(before)).toContain(before);
      expect(exceptionRecoveryTargets(before)).toContain("CANCELLED");
    }
    // No recorded prior status assumes nothing about the journey.
    expect(exceptionRecoveryTargets(null)).toEqual(["RECEIVED", "CANCELLED"]);
  });

  test("recovery keeps the tracking timeline and the WhatsApp routing correct", async () => {
    const { tenant, shipment } = await shipmentAt("PARTIALLY_ARRIVED");
    await raiseException(shipment.id, "MISSING_CARTON", undefined);
    await resolveException(shipment.id);

    const events = await prisma.trackingEvent.findMany({ where: { shipmentId: shipment.id }, orderBy: { createdAt: "asc" } });
    expect(events.some((e) => e.eventType === "EXCEPTION")).toBe(true);
    expect(events.some((e) => e.eventType === "PARTIALLY_ARRIVED" && e.description === "تم حل الاستثناء")).toBe(true);

    // The partial-arrival message is receiver-routed (P1-1) and that is unchanged by the recovery.
    const log = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: shipment.id, event: "SHIPMENT_PARTIALLY_ARRIVED" } }),
      (l) => l !== null
    );
    expect(log!.recipient).toBe("RECEIVER");

    await cleanupTenant(tenant.company.id);
  });

  test("the screen offers business actions, never status names", async ({ page }) => {
    const { tenant, shipment } = await shipmentAt("PARTIALLY_ARRIVED");
    await raiseException(shipment.id, "MISSING_CARTON", "نقص كرتون");

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await expect(page.locator('button:has-text("إعادتها إلى الوصول الجزئي")')).toBeVisible();
    await expect(page.locator('button:has-text("تجهيزها لاستلام العميل")')).toBeVisible();
    await expect(page.locator('button:has-text("إلغاء الشحنة")')).toBeVisible();
    // No raw enum leaks into the employee's screen.
    await expect(page.locator("text=PARTIALLY_ARRIVED")).toHaveCount(0);
    await expect(page.locator("text=READY_FOR_PICKUP")).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await cleanupTenant(tenant.company.id);
  });
});
