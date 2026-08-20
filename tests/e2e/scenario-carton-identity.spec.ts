import { test, expect, type Page } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil, expectNotFound } from "./helpers";
import { confirmBulkUnload, reportPartialArrival } from "@/modules/trips/service";

/**
 * P1-5 (D1): the system knew how many cartons arrived and invented which ones.
 *
 * confirmBulkUnload marked `cartons.slice(0, arrived)` as arrived and the tail as MISSING, so a
 * shipment where C3 never made it recorded C5 as missing — in the carton table, the tracking note,
 * and every dispute that followed. These tests pin identity: the cartons named as missing are the
 * cartons marked MISSING, the count is derived from them, and no ordering assumption survives.
 */

const MOBILE = { width: 390, height: 844 };

async function tripWithUnload(cartonCount = 5) {
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
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount,
    status: "IN_TRANSIT",
  });
  await linkShipmentToTrip(trip.id, shipment.id, loadStop.id, unloadStop.id);
  await prisma.tripShipmentStop.updateMany({
    where: { tripId: trip.id, shipmentId: shipment.id },
    data: { loadedAt: new Date(), cartonsLoaded: cartonCount },
  });
  return { tenant, trip, loadStop, unloadStop, shipment, origin, destination };
}

const cartonsOf = (shipmentId: string) =>
  prisma.carton.findMany({ where: { shipmentId }, orderBy: { cartonIndex: "asc" } });

/** The carton at a 1-based index, i.e. the one printed "C3" on the label. */
async function cartonByIndex(shipmentId: string, index: number) {
  const cartons = await cartonsOf(shipmentId);
  return cartons.find((c) => c.cartonIndex === index)!;
}

function stopCard(page: Page, stopId: string) {
  return page.getByTestId(`stop-${stopId}`);
}

test.describe("Carton identity at unload — service", () => {
  test("nothing marked missing: every carton arrives and the shipment completes", async () => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(5);

    await confirmBulkUnload(unloadStop.id, undefined, []);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("ARRIVED");
    expect(db.arrivedCartons).toBe(5);
    const cartons = await cartonsOf(shipment.id);
    expect(cartons.every((c) => c.status === "ARRIVED")).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("C3 missing marks C3 — not the last carton by index", async () => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(5);
    const c3 = await cartonByIndex(shipment.id, 3);

    await confirmBulkUnload(unloadStop.id, undefined, [c3.id]);

    const cartons = await cartonsOf(shipment.id);
    const missing = cartons.filter((c) => c.status === "MISSING");
    expect(missing).toHaveLength(1);
    // The whole bug in one assertion: the old slice-based code would have marked C5.
    expect(missing[0].cartonIndex).toBe(3);
    expect(missing[0].cartonCode).toBe(c3.cartonCode);
    expect(cartons.filter((c) => c.status === "ARRIVED").map((c) => c.cartonIndex)).toEqual([1, 2, 4, 5]);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("PARTIALLY_ARRIVED");
    // Derived from the cartons, so the count and the identities cannot disagree.
    expect(db.arrivedCartons).toBe(4);

    await cleanupTenant(tenant.company.id);
  });

  test("several cartons can be missing at once, in any positions", async () => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(6);
    const [c1, c4] = await Promise.all([cartonByIndex(shipment.id, 1), cartonByIndex(shipment.id, 4)]);

    await confirmBulkUnload(unloadStop.id, undefined, [c1.id, c4.id]);

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.filter((c) => c.status === "MISSING").map((c) => c.cartonIndex)).toEqual([1, 4]);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).arrivedCartons).toBe(4);

    await cleanupTenant(tenant.company.id);
  });

  test("two shipments at one stop keep their own carton identities", async () => {
    const { tenant, trip, loadStop, unloadStop, shipment, origin, destination } = await tripWithUnload(4);
    const second = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: origin.id,
      unloadBranchId: destination.id,
      cartonCount: 3,
      status: "IN_TRANSIT",
    });
    await linkShipmentToTrip(trip.id, second.id, loadStop.id, unloadStop.id);
    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id, shipmentId: second.id },
      data: { loadedAt: new Date(), cartonsLoaded: 3 },
    });
    const firstC2 = await cartonByIndex(shipment.id, 2);

    await confirmBulkUnload(unloadStop.id, undefined, [firstC2.id]);

    expect((await cartonsOf(shipment.id)).filter((c) => c.status === "MISSING").map((c) => c.cartonIndex)).toEqual([2]);
    // The other shipment is untouched by its neighbour's shortfall.
    expect((await cartonsOf(second.id)).every((c) => c.status === "ARRIVED")).toBe(true);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("ARRIVED");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("PARTIALLY_ARRIVED");

    await cleanupTenant(tenant.company.id);
  });

  test("a carton from another shipment, stop or company cannot be marked missing here", async () => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(3);
    const other = await tripWithUnload(3);
    const foreignCarton = await cartonByIndex(other.shipment.id, 1);

    await expect(confirmBulkUnload(unloadStop.id, undefined, [foreignCarton.id])).rejects.toThrow(/لا ينتمي/);

    // Rejected before anything is written: this stop's own unload did not half-happen.
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("IN_TRANSIT");
    expect((await cartonsOf(shipment.id)).every((c) => c.status !== "MISSING")).toBe(true);
    expect((await cartonsOf(other.shipment.id)).every((c) => c.status !== "MISSING")).toBe(true);

    await cleanupTenant(other.tenant.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("the tracking timeline names the missing carton, not just a shortfall", async () => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(5);
    const c3 = await cartonByIndex(shipment.id, 3);

    await confirmBulkUnload(unloadStop.id, undefined, [c3.id]);

    const event = await prisma.trackingEvent.findFirstOrThrow({
      where: { shipmentId: shipment.id, eventType: "PARTIALLY_ARRIVED" },
    });
    expect(event.description).toContain(c3.cartonCode);
    expect(event.description).toContain("لم يصل");

    // The WhatsApp event for a partial arrival still fires, unchanged by any of this.
    const log = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: shipment.id, event: "SHIPMENT_PARTIALLY_ARRIVED" } }),
      (l) => l !== null
    );
    expect(log!.recipient).toBe("RECEIVER");

    await cleanupTenant(tenant.company.id);
  });

  test("the driver's problem report names cartons too, and reconciles the trip bookkeeping", async () => {
    const { tenant, trip, shipment } = await tripWithUnload(5);
    const c2 = await cartonByIndex(shipment.id, 2);

    await reportPartialArrival(shipment.id, [c2.id]);

    expect((await cartonsOf(shipment.id)).filter((c) => c.status === "MISSING").map((c) => c.cartonIndex)).toEqual([2]);
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("PARTIALLY_ARRIVED");
    expect(db.arrivedCartons).toBe(4);
    const link = await prisma.tripShipmentStop.findFirstOrThrow({ where: { tripId: trip.id, shipmentId: shipment.id } });
    expect(link.unloadedAt).not.toBeNull();
    expect(link.cartonsUnloaded).toBe(4);

    await cleanupTenant(tenant.company.id);
  });

  test("the late-arriving remainder clears every missing carton", async () => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(5);
    const c3 = await cartonByIndex(shipment.id, 3);
    await confirmBulkUnload(unloadStop.id, undefined, [c3.id]);

    const { confirmRemainingArrived } = await import("@/modules/trips/service");
    await confirmRemainingArrived(shipment.id);

    expect((await cartonsOf(shipment.id)).every((c) => c.status === "ARRIVED")).toBe(true);
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("ARRIVED");
    expect(db.arrivedCartons).toBe(5);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Carton identity at unload — screens", () => {
  test("mobile: the driver taps the missing carton and confirms", async ({ page }) => {
    const { tenant, trip, unloadStop, shipment } = await tripWithUnload(5);
    const c3 = await cartonByIndex(shipment.id, 3);

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    await stopCard(page, unloadStop.id).locator('button:has-text("تأكيد التفريغ")').click();
    const summary = page.getByTestId("unload-summary");
    await expect(summary).toHaveText(/5\s*كرتون/);
    await expect(summary).toHaveText(/5\s*وصلت/);

    await page.getByTestId(`carton-${c3.cartonCode}`).click();
    await expect(summary).toHaveText(/4\s*وصلت/);
    await expect(summary).toHaveText(/1\s*مفقود/);
    // The confirm is never blocked, but a shortfall cannot pass unannounced.
    await expect(page.locator("text=سيتم تسجيل")).toBeVisible();

    // No sideways scrolling to reach the confirm on a 390px screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.click('[role="dialog"] button:has-text("تأكيد التفريغ")');
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "PARTIALLY_ARRIVED"
    );
    expect((await cartonsOf(shipment.id)).filter((c) => c.status === "MISSING").map((c) => c.cartonIndex)).toEqual([3]);

    await cleanupTenant(tenant.company.id);
  });

  test("desktop: the office confirms a full unload without touching a single carton", async ({ page }) => {
    const { tenant, trip, unloadStop, shipment } = await tripWithUnload(4);

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    await stopCard(page, unloadStop.id).locator('button:has-text("تأكيد التفريغ")').click();
    await expect(page.getByTestId("unload-summary")).toHaveText(/0\s*مفقود/);
    await page.click('[role="dialog"] button:has-text("تأكيد التفريغ")');

    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "ARRIVED"
    );
    expect((await cartonsOf(shipment.id)).every((c) => c.status === "ARRIVED")).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("the shipment page reports the totals and names what is missing", async ({ page }) => {
    const { tenant, unloadStop, shipment } = await tripWithUnload(5);
    const c3 = await cartonByIndex(shipment.id, 3);
    await confirmBulkUnload(unloadStop.id, undefined, [c3.id]);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("الكراتين")');

    const summary = page.getByTestId("carton-summary");
    await expect(summary).toHaveText(/5\s*كراتين/);
    await expect(summary).toHaveText(/4\s*وصلت/);
    await expect(summary).toHaveText(/1\s*مفقود/);
    await expect(page.getByTestId("missing-cartons")).toContainText(c3.cartonCode);

    await cleanupTenant(tenant.company.id);
  });

  test("company and branch isolation: an outsider cannot open the stop to mark anything missing", async ({ page }) => {
    const { tenant, trip, shipment } = await tripWithUnload(3);
    const outsider = await createTestTenant();

    await login(page, outsider.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);
    await expectNotFound(page, [shipment.shipmentNumber, trip.tripNumber]);

    // A driver from the other company is refused the driver screen for the same trip.
    await login(page, outsider.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);
    await expectNotFound(page, [shipment.shipmentNumber, trip.tripNumber]);

    expect((await cartonsOf(shipment.id)).every((c) => c.status !== "MISSING")).toBe(true);

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });
});
