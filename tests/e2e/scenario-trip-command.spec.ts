import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  prisma,
  TEST_PASSWORD,
  createTestTenant,
  createTestShipment,
  createTestTrip,
  createBranchScopedUser,
  linkShipmentToTrip,
  login,
  cleanupTenant,
  pollUntil,
  visibleText,
} from "./helpers";
import { assignTripCrew, cancelTrip, unassignShipmentFromTrip, autoAssignShipmentToTrip } from "../../src/modules/trips/service";

/** Every tenant helper seeds its driver with this name. */
const DRIVER_NAME = "سائق اختبار";

/**
 * TRIP COMMAND — a trip stops being a record written once.
 *
 * `Trip.driverId` was set by createTrip and by nothing else in the product, and `CANCELLED` was a
 * status no code path could reach. So a trip planned before the crew was decided could never be
 * executed, a sick driver could not be replaced, a wrongly linked shipment was stranded, and a trip
 * created by mistake sat in the list — and in front of a driver — forever.
 */

async function planTrip(tenant: Awaited<ReturnType<typeof createTestTenant>>, opts: { withDriver?: boolean } = {}) {
  const [origin, destination] = tenant.branches;
  const trip = await createTestTrip({
    companyId: tenant.company.id,
    driverId: opts.withDriver ? tenant.driverId : undefined,
    stops: [
      { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
      { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
    ],
  });
  return { trip, origin, destination };
}

async function makeShipment(tenant: Awaited<ReturnType<typeof createTestTenant>>) {
  const [origin, destination] = tenant.branches;
  return createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount: 3,
    status: "READY_FOR_LOADING",
  });
}

async function secondDriver(companyId: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return prisma.user.create({
    data: { companyId, name: "سائق ثانٍ", email: `driver2-${Date.now()}@test.local`, passwordHash, userType: "DRIVER" },
  });
}

test.describe("Assigning a crew after the trip exists", () => {
  test("a trip planned with no driver can be given one, and it reaches that driver's app", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant);
    expect(trip.driverId).toBeNull();

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);
    // The state that had no exit: the page said "لم يُعيّن" and offered nothing to do about it.
    await expect(visibleText(page, "لم يُعيّن").first()).toBeVisible();

    await page.getByRole("button", { name: "تعيين سائق" }).click();
    await page.locator('[role="dialog"] button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("${DRIVER_NAME}")`).click();
    await page.locator('[role="dialog"] button:has-text("حفظ الطاقم")').click();

    const assigned = await pollUntil(
      () => prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }),
      (t) => t.driverId === tenant.driverId
    );
    expect(assigned.driverId).toBe(tenant.driverId);

    // The whole point: it is now executable.
    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(visibleText(page, trip.tripNumber).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("reassigning moves the trip off the first driver's screen and onto the second's", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant, { withDriver: true });
    const other = await secondDriver(tenant.company.id);

    await assignTripCrew({ companyId: tenant.company.id, tripId: trip.id, driverId: other.id, vehicleId: null });

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    // The trip keeps its number, its stops and its links — reassignment edits the trip rather than
    // replacing it, which is the only way the work already recorded on it survives.
    await expect(page.locator(`text=${trip.tripNumber}`)).toHaveCount(0);
    await expect(visibleText(page, "لا توجد رحلة نشطة").first()).toBeVisible();

    await login(page, other.email);
    await page.goto("/driver");
    await expect(visibleText(page, trip.tripNumber).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a driver already committed to a live trip is labelled, not hidden", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const busy = await planTrip(tenant, { withDriver: true });
    await prisma.trip.update({ where: { id: busy.trip.id }, data: { status: "IN_PROGRESS" } });
    const { trip: newTrip } = await planTrip(tenant);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${newTrip.id}`);
    await page.getByRole("button", { name: "تعيين سائق" }).click();
    await page.locator('[role="dialog"] button[role="combobox"]').first().click();

    // Stated, and still selectable: one driver taking two runs in a day is normal dispatch, and a
    // product that refuses is one the office works around on paper.
    const option = page.locator(`[role="option"]:has-text("${DRIVER_NAME}")`);
    await expect(option).toContainText(busy.trip.tripNumber);
    await option.click();
    await expect(page.locator('[role="dialog"]')).toContainText(busy.trip.tripNumber);

    await cleanupTenant(tenant.company.id);
  });

  test("crew assignment refuses another tenant's driver, and a disabled one", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const outsider = await createTestTenant(["عدن", "المكلا"]);
    const { trip } = await planTrip(tenant);

    await expect(
      assignTripCrew({ companyId: tenant.company.id, tripId: trip.id, driverId: outsider.driverId, vehicleId: null })
    ).rejects.toThrow(/سائق غير صالح/);

    await prisma.user.update({ where: { id: tenant.driverId }, data: { status: "DISABLED" } });
    await expect(
      assignTripCrew({ companyId: tenant.company.id, tripId: trip.id, driverId: tenant.driverId, vehicleId: null })
    ).rejects.toThrow(/سائق غير صالح/);

    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).driverId).toBeNull();

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Calling off a trip that has not happened", () => {
  test("cancelling releases its shipments and clears the driver's screen", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant, { withDriver: true });
    const shipment = await makeShipment(tenant);
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);

    // Before: a mistake typed into the office computer that a driver has to look at every morning.
    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(visibleText(page, trip.tripNumber).first()).toBeVisible();

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);
    await page.getByRole("button", { name: "إلغاء الرحلة" }).click();
    await page.locator('[role="dialog"] button:has-text("تأكيد")').click();

    const cancelled = await pollUntil(
      () => prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }),
      (t) => t.status === "CANCELLED"
    );
    expect(cancelled.status).toBe("CANCELLED");
    // The reservation is gone, so the shipment is free — the hostage situation this fixes.
    expect(await prisma.tripShipmentStop.count({ where: { tripId: trip.id } })).toBe(0);

    const replacement = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenant.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await autoAssignShipmentToTrip(replacement.id, shipment.id);
    expect(await prisma.tripShipmentStop.count({ where: { tripId: replacement.id, shipmentId: shipment.id } })).toBe(1);

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(page.locator(`text=${trip.tripNumber}`)).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a trip that already moved cargo cannot be cancelled, from the service or the screen", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant, { withDriver: true });
    const shipment = await makeShipment(tenant);
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id },
      data: { loadedAt: new Date(), cartonsLoaded: 3 },
    });

    await expect(cancelTrip(tenant.company.id, trip.id)).rejects.toThrow(/بدأ تحميل/);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).not.toBe("CANCELLED");

    // And the button is not offered at all — a control that is always refused teaches people to
    // distrust the ones that work.
    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);
    await expect(page.getByRole("button", { name: "إلغاء الرحلة" })).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a departed stop blocks cancellation too", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant, { withDriver: true });
    await prisma.tripStop.update({
      where: { id: trip.stops[0].id },
      data: { status: "DEPARTED", actualDeparture: new Date() },
    });

    await expect(cancelTrip(tenant.company.id, trip.id)).rejects.toThrow(/انطلقت/);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Taking a shipment back off a trip", () => {
  test("a shipment linked by mistake can be removed and reused", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant, { withDriver: true });
    const shipment = await makeShipment(tenant);
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);
    await expect(visibleText(page, shipment.shipmentNumber).first()).toBeVisible();

    await page.getByRole("button", { name: "إزالة" }).first().click();
    await page.locator('[role="dialog"] button:has-text("تأكيد")').click();

    await pollUntil(
      () => prisma.tripShipmentStop.count({ where: { tripId: trip.id } }),
      (count) => count === 0
    );

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment already on the truck cannot be unlinked", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant, { withDriver: true });
    const shipment = await makeShipment(tenant);
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
    const link = await prisma.tripShipmentStop.findFirstOrThrow({ where: { tripId: trip.id } });
    await prisma.tripShipmentStop.update({ where: { id: link.id }, data: { loadedAt: new Date(), cartonsLoaded: 3 } });

    await expect(
      unassignShipmentFromTrip({ companyId: tenant.company.id, tripId: trip.id, linkId: link.id })
    ).rejects.toThrow(/محمّلة/);
    expect(await prisma.tripShipmentStop.count({ where: { tripId: trip.id } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Who is driving what, on the screens that ask", () => {
  test("an unassigned live trip says so in the trips list", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant);

    await login(page, tenant.adminEmail);
    await page.goto("/app/trips");
    await expect(visibleText(page, trip.tripNumber).first()).toBeVisible();
    await expect(visibleText(page, "بلا سائق").first()).toBeVisible();

    await assignTripCrew({ companyId: tenant.company.id, tripId: trip.id, driverId: tenant.driverId, vehicleId: null });
    await page.reload();
    await expect(page.locator("text=بلا سائق")).toHaveCount(0);
    await expect(visibleText(page, DRIVER_NAME).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a branch employee without assignDriver cannot change the crew", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await planTrip(tenant);
    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { trips: ["view", "edit"] },
    });

    await login(page, employee.email);
    await page.goto(`/app/trips/${trip.id}`);
    await expect(visibleText(page, trip.tripNumber).first()).toBeVisible();
    // trips.assignDriver has existed in the permission matrix since the beginning and guarded
    // nothing, because there was nothing to guard. It guards this.
    await expect(page.getByRole("button", { name: "تعيين سائق" })).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });
});
