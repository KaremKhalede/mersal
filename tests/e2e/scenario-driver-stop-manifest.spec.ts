import { test, expect, type Page } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, expectNotFound } from "./helpers";

/**
 * P1-3: the driver's stop showed a count and nothing else — "تأكيد التحميل (3)" with no way to know
 * which three shipments, how many cartons, or where they are going. Everything asserted here is
 * rendered from the trip query the page already ran; no new endpoint, and deliberately no scanning.
 */

const MOBILE = { width: 390, height: 844 };

async function tripWithStops() {
  const tenant = await createTestTenant(["الرياض", "المكلا", "سيئون"]);
  const [origin, destination, third] = tenant.branches;
  const trip = await createTestTrip({
    companyId: tenant.company.id,
    driverId: tenant.driverId,
    stops: [
      { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
      { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
      { branchId: third.id, loadingEnabled: false, unloadingEnabled: true },
    ],
  });
  return { tenant, trip, origin, destination, third };
}

async function addShipment(params: {
  companyId: string;
  customerId: string;
  origin: string;
  destination: string;
  tripId: string;
  loadStopId: string;
  unloadStopId: string;
  cartonCount: number;
  status?: string;
  arrivedCartons?: number;
}) {
  const shipment = await createTestShipment({
    companyId: params.companyId,
    customerId: params.customerId,
    loadBranchId: params.origin,
    unloadBranchId: params.destination,
    cartonCount: params.cartonCount,
    status: params.status,
  });
  if (params.arrivedCartons != null) {
    await prisma.shipment.update({ where: { id: shipment.id }, data: { arrivedCartons: params.arrivedCartons } });
  }
  await linkShipmentToTrip(params.tripId, shipment.id, params.loadStopId, params.unloadStopId);
  return shipment;
}

/** The stop card the driver is looking at — every assertion is scoped to it, so a shipment listed
 *  under a different stop can never satisfy one by accident. */
function stopCard(page: Page, stopId: string) {
  return page.getByTestId(`stop-${stopId}`);
}

test.describe("Driver stop manifest", () => {
  test("a stop with nothing to do says so instead of showing an empty list", async ({ page }) => {
    const { tenant, trip } = await tripWithStops();

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    const card = stopCard(page, trip.stops[0].id);
    await expect(card.locator("text=لا شيء للتحميل أو التفريغ هنا الآن")).toBeVisible();
    await expect(card.locator("text=للتحميل هنا")).toHaveCount(0);
    // Nothing to confirm, so no confirm button is offered — only departing.
    await expect(card.locator('button:has-text("تأكيد التحميل")')).toHaveCount(0);
    await expect(card.locator('button:has-text("مغادرة المحطة")')).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a loading stop lists every shipment with its number, cartons and destination, plus both totals", async ({ page }) => {
    const { tenant, trip, origin, destination, third } = await tripWithStops();
    const [loadStop, unloadStop, thirdStop] = trip.stops;

    const a = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 4,
    });
    const b = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: third.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: thirdStop.id, cartonCount: 7,
    });

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    const card = stopCard(page, loadStop.id);
    await expect(card.locator("text=للتحميل هنا")).toBeVisible();
    // Totals: two shipments, eleven cartons — the two numbers the driver is accountable for.
    await expect(card.getByTestId("manifest-totals")).toHaveText(/2\s*شحنة/);
    await expect(card.getByTestId("manifest-totals")).toHaveText(/11\s*كرتون/);
    await expect(card.locator("text=تم 0 من 2")).toBeVisible();

    const rowA = card.getByTestId(`manifest-row-${a.shipmentNumber}`);
    await expect(rowA).toContainText("4 كرتون");
    await expect(rowA).toContainText(destination.city);
    const rowB = card.getByTestId(`manifest-row-${b.shipmentNumber}`);
    await expect(rowB).toContainText("7 كرتون");
    await expect(rowB).toContainText(third.city);

    // "What is left" is stated explicitly, not left to be counted off the list.
    await expect(card.getByTestId("manifest-remaining")).toHaveText(/2\s*شحنة/);
    await expect(card.getByTestId("manifest-remaining")).toHaveText(/11\s*كرتون/);

    await cleanupTenant(tenant.company.id);
  });

  test("confirmed shipments read as done and stop counting toward what is left", async ({ page }) => {
    const { tenant, trip, origin, destination } = await tripWithStops();
    const [loadStop, unloadStop] = trip.stops;

    const loaded = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 3, status: "LOADED",
    });
    const waiting = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 5,
    });
    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id, shipmentId: loaded.id },
      data: { loadedAt: new Date(), cartonsLoaded: 3 },
    });

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    const card = stopCard(page, loadStop.id);
    await expect(card.locator("text=تم 1 من 2")).toBeVisible();
    // Both shipments stay listed — "what was done" is as much a question as "what is left".
    await expect(card.getByTestId(`manifest-row-${loaded.shipmentNumber}`)).toBeVisible();
    await expect(card.getByTestId(`manifest-row-${waiting.shipmentNumber}`)).toBeVisible();
    await expect(card.getByTestId("manifest-remaining")).toHaveText(/1\s*شحنة/);
    await expect(card.getByTestId("manifest-remaining")).toHaveText(/5\s*كرتون/);
    // The action button counts only what is still pending.
    await expect(card.locator('button:has-text("تأكيد التحميل (1)")')).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("an unloading stop lists what comes off here, and only once it has actually been loaded", async ({ page }) => {
    const { tenant, trip, origin, destination } = await tripWithStops();
    const [loadStop, unloadStop] = trip.stops;

    const onboard = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 6, status: "IN_TRANSIT",
    });
    const neverLoaded = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 2,
    });
    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id, shipmentId: onboard.id },
      data: { loadedAt: new Date(), cartonsLoaded: 6 },
    });

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    const card = stopCard(page, unloadStop.id);
    await expect(card.locator("text=للتفريغ هنا")).toBeVisible();
    await expect(card.getByTestId("manifest-totals")).toHaveText(/1\s*شحنة/);
    await expect(card.getByTestId("manifest-totals")).toHaveText(/6\s*كرتون/);
    await expect(card.getByTestId(`manifest-row-${onboard.shipmentNumber}`)).toBeVisible();
    // A shipment still sitting at the origin cannot be unloaded here, so it is not listed.
    await expect(card.getByTestId(`manifest-row-${neverLoaded.shipmentNumber}`)).toHaveCount(0);
    await expect(card.locator('button:has-text("تأكيد التفريغ (1)")')).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a partially arrived shipment shows the shortfall on the driver's own screen", async ({ page }) => {
    const { tenant, trip, origin, destination } = await tripWithStops();
    const [loadStop, unloadStop] = trip.stops;

    const short = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 5,
      status: "PARTIALLY_ARRIVED", arrivedCartons: 3,
    });
    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id, shipmentId: short.id },
      data: { loadedAt: new Date(), cartonsLoaded: 5 },
    });

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    const row = stopCard(page, unloadStop.id).getByTestId(`manifest-row-${short.shipmentNumber}`);
    await expect(row).toContainText("وصل 3 من 5 كراتين");
    await expect(row).toContainText("وصول جزئي");

    await cleanupTenant(tenant.company.id);
  });

  test("the primary action is one tap from the manifest, sized for a phone", async ({ page }) => {
    const { tenant, trip, origin, destination } = await tripWithStops();
    const [loadStop, unloadStop] = trip.stops;
    await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 3,
    });

    await page.setViewportSize(MOBILE);
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    const cta = stopCard(page, loadStop.id).locator('button:has-text("تأكيد التحميل")');
    const box = await cta.boundingBox();
    // 48px is the tap-target floor these driver buttons are built to (h-12) — a driver confirms
    // this wearing gloves at a loading dock.
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // No horizontal overflow at 390px: a manifest the driver has to scroll sideways to read is
    // worse than the counter it replaced.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await cta.click();
    await expect(page.locator("text=تم تحميل 1 شحنة")).toBeVisible();
    await expect(stopCard(page, loadStop.id).locator("text=اكتمل")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("another driver's trip is not readable, manifest included", async ({ page }) => {
    const { tenant, trip, origin, destination } = await tripWithStops();
    const [loadStop, unloadStop] = trip.stops;
    const shipment = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 3,
    });

    // Same company, different driver — the trip is not theirs, so nothing about it may render.
    const other = await prisma.user.create({
      data: {
        companyId: tenant.company.id,
        name: "سائق آخر",
        email: `other-driver-${Date.now()}@test.local`,
        passwordHash: (await prisma.user.findUniqueOrThrow({ where: { email: tenant.driverEmail } })).passwordHash,
        userType: "DRIVER",
      },
    });

    await login(page, other.email);
    await page.goto(`/driver/trip/${trip.id}`);
    await expectNotFound(page, [shipment.shipmentNumber, trip.tripNumber]);

    await cleanupTenant(tenant.company.id);
  });

  test("a driver from another company cannot read the trip or its shipments", async ({ page }) => {
    const { tenant, trip, origin, destination } = await tripWithStops();
    const [loadStop, unloadStop] = trip.stops;
    const shipment = await addShipment({
      companyId: tenant.company.id, customerId: tenant.customerId, origin: origin.id, destination: destination.id,
      tripId: trip.id, loadStopId: loadStop.id, unloadStopId: unloadStop.id, cartonCount: 3,
    });
    const outsider = await createTestTenant();

    await login(page, outsider.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);
    await expectNotFound(page, [shipment.shipmentNumber, trip.tripNumber]);

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("a company employee session cannot reach the driver screen at all", async ({ page }) => {
    const { tenant, trip } = await tripWithStops();

    await login(page, tenant.adminEmail);
    await page.goto(`/driver/trip/${trip.id}`);
    await expect(page).toHaveURL(/\/login/);

    await cleanupTenant(tenant.company.id);
  });
});
