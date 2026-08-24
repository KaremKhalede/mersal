import { test, expect } from "@playwright/test";
import {
  prisma,
  createTestTenant,
  createTestShipment,
  createTestTrip,
  createBranchScopedUser,
  linkShipmentToTrip,
  login,
  cleanupTenant,
  pollUntil,
  visibleText,
  driverStopCard,
} from "./helpers";
import { arriveAtStop } from "../../src/modules/trips/service";

/**
 * DRIVER EXPERIENCE — arrival, progress, and a number to call.
 *
 * The load-bearing claim: `TripStop.actualArrival` had three readers and no writer. Every stop in
 * the database carried null, so the office's lateness rule measured a plan against `now` and a
 * finished trip drifted further into "late" every day it was left alone. These tests prove the
 * column is now written, written once, written by both the driver and the office through the same
 * service function — and that the badge reading it has stopped drifting.
 */

const MIN = 60_000;

/** A two-stop trip with a shipment aboard, assigned to the tenant's driver. */
async function tripWithCargo(tenant: Awaited<ReturnType<typeof createTestTenant>>, plannedOffsetMin = 60) {
  const [origin, destination] = tenant.branches;
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount: 3,
    status: "READY_FOR_LOADING",
  });
  const trip = await createTestTrip({
    companyId: tenant.company.id,
    driverId: tenant.driverId,
    stops: [
      { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
      {
        branchId: destination.id,
        loadingEnabled: false,
        unloadingEnabled: true,
        plannedArrival: new Date(Date.now() + plannedOffsetMin * MIN),
      },
    ],
  });
  await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
  return { trip, shipment, origin, destination };
}

test.describe("Driver — recording arrival at a stop", () => {
  test("the button stamps actualArrival, moves the stop to ARRIVED, and shows the time back", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await tripWithCargo(tenant);
    const firstStop = trip.stops[0];

    // Precondition, and the whole reason this feature exists.
    expect(firstStop.actualArrival).toBeNull();

    await login(page, tenant.driverEmail);
    await page.goto("/driver");

    await expect(visibleText(page, "تأكيد الوصول").first()).toBeVisible();
    await page.getByRole("button", { name: "تأكيد الوصول" }).first().click();

    const stamped = await pollUntil(
      () => prisma.tripStop.findUniqueOrThrow({ where: { id: firstStop.id } }),
      (s) => s.actualArrival !== null
    );
    expect(stamped.status).toBe("ARRIVED");

    // The driver sees their own tap land — the confirmation that makes the button trustworthy on a
    // connection that drops. It lives in the stop's stage strip now (الوصول ✓ with its time) rather
    // than in a line of its own, so the same row answers "which step am I on" and "did it save".
    const stages = page.getByTestId("stop-stages");
    await expect(stages).toContainText("الوصول");
    await expect(stages).toContainText(/\d{1,2}:\d{2}/);
    // And it is gone, not greyed out, once it is a fact: the arrival is stamped once, the time is
    // stated above, and the action bar has already moved on to the next step in the chain.
    await expect(page.getByRole("button", { name: "تأكيد الوصول" })).toHaveCount(0);

    const audit = await prisma.auditLog.findFirst({
      where: { companyId: tenant.company.id, action: "ARRIVE_STOP", entityId: firstStop.id },
    });
    expect(audit?.userId).toBe(tenant.driverId);

    await cleanupTenant(tenant.company.id);
  });

  test("a second arrival keeps the first timestamp instead of rewriting it", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await tripWithCargo(tenant);
    const stopId = trip.stops[0].id;

    const first = await arriveAtStop(trip.id, stopId, tenant.driverId);
    expect(first.recorded).toBe(true);
    const afterFirst = await prisma.tripStop.findUniqueOrThrow({ where: { id: stopId } });

    // A double-tap in a truck is the normal case, not an edge case.
    const second = await arriveAtStop(trip.id, stopId, tenant.driverId);
    expect(second.recorded).toBe(false);
    const afterSecond = await prisma.tripStop.findUniqueOrThrow({ where: { id: stopId } });
    expect(afterSecond.actualArrival?.getTime()).toBe(afterFirst.actualArrival?.getTime());

    // And only one audit row, so the activity log does not report two arrivals.
    const audits = await prisma.auditLog.count({
      where: { companyId: tenant.company.id, action: "ARRIVE_STOP", entityId: stopId },
    });
    expect(audits).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("a departed stop and a finished trip both refuse a late arrival stamp", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await tripWithCargo(tenant);

    // Departed without an arrival ever being pressed — the case the timing fallback covers.
    await prisma.tripStop.update({
      where: { id: trip.stops[0].id },
      data: { status: "DEPARTED", actualDeparture: new Date() },
    });
    const departed = await arriveAtStop(trip.id, trip.stops[0].id, tenant.driverId);
    expect(departed.recorded).toBe(false);
    const stop = await prisma.tripStop.findUniqueOrThrow({ where: { id: trip.stops[0].id } });
    expect(stop.actualArrival).toBeNull();

    await prisma.trip.update({ where: { id: trip.id }, data: { status: "COMPLETED" } });
    await expect(arriveAtStop(trip.id, trip.stops[1].id, tenant.driverId)).rejects.toThrow(/منتهية/);

    await cleanupTenant(tenant.company.id);
  });

  test("a stop the truck has not reached yet refuses an arrival, from the UI and from the service", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip } = await tripWithCargo(tenant);

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    // Exactly one arrive button on a two-stop trip: the stop the truck is actually at. A driver
    // looking at the whole route must not be able to stamp a stop they have not driven to.
    await expect(page.getByRole("button", { name: "تأكيد الوصول" })).toHaveCount(1);

    // The unreached stop keeps its other buttons on purpose — a driver who forgot to press
    // "مغادرة المحطة" at the previous stop must still be able to unload here. Only the arrival
    // stamp, which the office's lateness signal is computed from, is position-gated. They are one
    // fold away rather than in the driver's face, which is the whole point of the screen.
    await expect(page.locator(`[data-testid="stop-${trip.stops[1].id}"]`)).toBeVisible();
    const unreached = await driverStopCard(page, trip.stops[1].id);
    await expect(unreached.locator('button:has-text("مغادرة المحطة")')).toBeVisible();
    await expect(unreached.getByRole("button", { name: "تأكيد الوصول" })).toHaveCount(0);

    // And the rule is the server's, not the button's — a stale page cannot post past it.
    await expect(arriveAtStop(trip.id, trip.stops[1].id, tenant.driverId)).rejects.toThrow(/لم تغادر المحطة السابقة/);
    const untouched = await prisma.tripStop.findUniqueOrThrow({ where: { id: trip.stops[1].id } });
    expect(untouched.actualArrival).toBeNull();

    // Once the first stop is behind them, the second becomes recordable.
    await prisma.tripStop.update({
      where: { id: trip.stops[0].id },
      data: { status: "DEPARTED", actualDeparture: new Date() },
    });
    const second = await arriveAtStop(trip.id, trip.stops[1].id, tenant.driverId);
    expect(second.recorded).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("a driver cannot record an arrival on another driver's trip", async ({ page }) => {
    const one = await createTestTenant(["الرياض", "سيئون"]);
    const two = await createTestTenant(["عدن", "المكلا"]);
    const theirs = await tripWithCargo(two);

    await login(page, one.driverEmail);
    // The stop id of another company's trip, taken straight to the driver route.
    await page.goto(`/driver/trip/${theirs.trip.id}`);
    await expect(page.locator("text=تأكيد الوصول")).toHaveCount(0);

    const stop = await prisma.tripStop.findUniqueOrThrow({ where: { id: theirs.trip.stops[0].id } });
    expect(stop.actualArrival).toBeNull();

    await cleanupTenant(one.company.id);
    await cleanupTenant(two.company.id);
  });
});

test.describe("Office — the same arrival, from the counter", () => {
  test("a branch employee records the truck pulling in, and the trip page shows the time", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip, origin } = await tripWithCargo(tenant);

    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: origin.id,
      permissions: { trips: ["view", "edit"] },
    });

    await login(page, employee.email);
    await page.goto(`/app/trips/${trip.id}`);
    await page.getByRole("button", { name: "تسجيل الوصول" }).first().click();

    await pollUntil(
      () => prisma.tripStop.findUniqueOrThrow({ where: { id: trip.stops[0].id } }),
      (s) => s.actualArrival !== null
    );
    await expect(visibleText(page, "وصلت").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("an employee scoped to another branch cannot record this stop's arrival", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون", "عدن"]);
    const { trip } = await tripWithCargo(tenant);
    const otherBranch = tenant.branches[2];

    const outsider = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: otherBranch.id,
      permissions: { trips: ["view", "edit"] },
    });
    expect(outsider.userId).toBeTruthy();

    // The stop belongs to الرياض; the employee is pinned to عدن. Stop-level actions are an EXACT
    // branch match, not "the trip touches my branch somewhere" — same rule as departing.
    const { assertStopInCompany } = await import("../../src/modules/trips/service");
    await expect(
      assertStopInCompany(tenant.company.id, trip.stops[0].id, trip.id, otherBranch.id)
    ).rejects.toThrow(/FORBIDDEN/);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Driver — knowing where they are and who to call", () => {
  test("progress states the position, the completed count, and what is still left", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "صنعاء", "سيئون"]);
    const [a, b, c] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: a.id, unloadBranchId: c.id, cartonCount: 4, status: "READY_FOR_LOADING",
    });
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: a.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: b.id, loadingEnabled: false, unloadingEnabled: false },
        { branchId: c.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[2].id);

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(visibleText(page, "المحطة 1 من 3").first()).toBeVisible();
    // One shipment waiting to be loaded, nothing yet unloadable (it is not aboard).
    await expect(visibleText(page, "المتبقي").first()).toBeVisible();
    await expect(visibleText(page, "1 للتحميل").first()).toBeVisible();

    // Move the truck past the first stop and the position advances.
    await prisma.tripStop.update({
      where: { id: trip.stops[0].id },
      data: { status: "DEPARTED", actualDeparture: new Date() },
    });
    await page.reload();
    await expect(visibleText(page, "المحطة 2 من 3").first()).toBeVisible();
    await expect(visibleText(page, "1 مكتملة").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("the office number is offered when the company has one, and nothing broken when it does not", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await tripWithCargo(tenant);

    // No phone on file yet — the button must be absent, not a dead `tel:` link.
    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(page.locator("text=اتصال بالمكتب")).toHaveCount(0);
    await expect(visibleText(page, "الإبلاغ عن مشكلة").first()).toBeVisible();

    await prisma.company.update({ where: { id: tenant.company.id }, data: { phone: "+967700123456" } });
    await page.reload();
    const call = page.getByRole("link", { name: /اتصال بالمكتب/ });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", /^tel:\+967700123456$/);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("The lateness badge stops drifting", () => {
  test("a stop that departed long ago is judged by its departure, not by today's clock", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const [origin, destination] = tenant.branches;
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * MIN;

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
        {
          branchId: destination.id,
          loadingEnabled: false,
          unloadingEnabled: true,
          // Planned for three days ago, and the truck left five minutes BEFORE the plan.
          plannedArrival: new Date(threeDaysAgo),
        },
      ],
    });
    await prisma.tripStop.update({
      where: { id: trip.stops[1].id },
      data: { status: "DEPARTED", actualDeparture: new Date(threeDaysAgo - 5 * MIN) },
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    // Before the departure fallback this read "متأخر" — and three days of drift is what made it
    // say so. The stop was, in fact, early.
    await expect(visibleText(page, "في الموعد").first()).toBeVisible();
    await expect(page.locator("text=متأخر")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Driver — more than one assignment, and a shipment that is not there", () => {
  test("the trip already on the road wins over one the office planned afterwards", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون", "عدن"]);
    const [a, b, c] = tenant.branches;

    const running = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: a.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: b.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await prisma.trip.update({ where: { id: running.id }, data: { status: "IN_PROGRESS" } });

    // Tomorrow's run, typed into the office computer while the truck is between two cities. The
    // home route used to resolve "the driver's trip" as the most recently created one, so this is
    // exactly the row that replaced a driver's live trip mid-run.
    const planned = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: a.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: c.id, loadingEnabled: false, unloadingEnabled: true, plannedArrival: new Date(Date.now() + 26 * 3600_000) },
      ],
    });

    await login(page, tenant.driverEmail);
    await page.goto("/driver");

    await expect(visibleText(page, running.tripNumber).first()).toBeVisible();
    // And the other one is not hidden either — it is stated once, quietly, as what comes next.
    const upcoming = page.getByTestId("driver-upcoming");
    await expect(upcoming).toContainText(planned.tripNumber);
    await expect(upcoming).toContainText(c.name);
    // Never as a competing workflow: nothing in that block is a link into the other trip.
    await expect(upcoming.locator("a")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("finishing a trip points at the next one instead of an empty screen", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون", "عدن"]);
    const [a, b, c] = tenant.branches;

    const done = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: a.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: b.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await prisma.trip.update({ where: { id: done.id }, data: { status: "COMPLETED" } });

    const next = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: a.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: c.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${done.id}`);
    await expect(visibleText(page, "اكتملت الرحلة").first()).toBeVisible();
    await expect(visibleText(page, next.tripNumber).first()).toBeVisible();

    await page.getByRole("link", { name: "الذهاب إلى الرحلة التالية" }).click();
    await page.waitForURL(/\/driver$/);
    await expect(visibleText(page, next.tripNumber).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment that never made it onto the truck can finally be reported as such", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const [origin, destination] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: origin.id, unloadBranchId: destination.id,
      cartonCount: 2, status: "READY_FOR_LOADING",
    });
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}/report-problem`);

    // The shipment is listed at all — the query used to require loadedAt, which made "شحنة لم
    // تُحمّل" an option that could never match anything in the picker above it.
    await page.locator('button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("${shipment.shipmentNumber}")`).click();
    await expect(visibleText(page, "لم تُحمّل").first()).toBeVisible();

    await page.fill('textarea[name="note"]', "الشحنة غير موجودة في الفرع");
    await page.getByRole("button", { name: /إرسال البلاغ/ }).click();

    const raised = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "EXCEPTION"
    );
    expect(raised.exceptionType).toBe("NOT_LOADED");
    // Nothing invented about cartons that never left the branch.
    expect(await prisma.carton.count({ where: { shipmentId: shipment.id, status: "MISSING" } })).toBe(0);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Driver — the stop's own progress, and what is on the truck", () => {
  test("the stage strip lists only the stages this stop has, and marks the one being worked", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await tripWithCargo(tenant);

    await login(page, tenant.driverEmail);
    await page.goto("/driver");

    // Stop 1 loads and does not unload: الوصول ← التحميل ← المغادرة, and no empty "التفريغ" step
    // for the driver to read past.
    const stages = page.getByTestId("stop-stages");
    await expect(stages).toContainText("الوصول");
    await expect(stages).toContainText("التحميل");
    await expect(stages).toContainText("المغادرة");
    await expect(stages).not.toContainText("التفريغ");
    await expect(stages.locator("li")).toHaveCount(3);

    await cleanupTenant(tenant.company.id);
  });

  test("what is on the truck is counted only once it is aboard, and vanishes when it comes off", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const { trip, shipment } = await tripWithCargo(tenant);

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    // Planned onto the trip is not the same as aboard it — the figure the office reads (route
    // totals) is not the one the driver is answerable for at a checkpoint.
    await expect(page.getByTestId("driver-onboard")).toHaveCount(0);

    await prisma.tripShipmentStop.updateMany({
      where: { tripId: trip.id, shipmentId: shipment.id },
      data: { loadedAt: new Date(), cartonsLoaded: 3 },
    });
    await page.reload();
    await expect(page.getByTestId("driver-onboard")).toContainText("1 شحنة · 3 كرتون");

    await prisma.tripShipmentStop.updateMany({ where: { tripId: trip.id }, data: { unloadedAt: new Date() } });
    await page.reload();
    await expect(page.getByTestId("driver-onboard")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });
});
