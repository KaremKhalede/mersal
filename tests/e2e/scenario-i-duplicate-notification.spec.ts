import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario I — duplicate notification prevention on concurrent bulk load", () => {
  test("two simultaneous confirm-load clicks send the customer exactly one loaded notification", async ({ browser }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 1,
    });

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: loadBranch.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: unloadBranch.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const [stop1] = trip.stops;
    await linkShipmentToTrip(trip.id, shipment.id, stop1.id, trip.stops[1].id);

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    await login(page1, tenant.adminEmail);
    await login(page2, tenant.adminEmail);
    await page1.goto(`/app/trips/${trip.id}`);
    await page2.goto(`/app/trips/${trip.id}`);

    await Promise.all([
      page1.getByTestId(`stop-${stop1.id}`).locator('button:has-text("تأكيد التحميل")').click(),
      page2.getByTestId(`stop-${stop1.id}`).locator('button:has-text("تأكيد التحميل")').click(),
    ]);
    // Status flips inside the same DB transaction as the tracking event, but the customer
    // notification is dispatched as a separate step afterward — poll for it too, not just status.
    const [dbShipment, , loadedNotifications] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
          prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "LOADED" } }),
          prisma.notificationLog.count({ where: { shipmentId: shipment.id, event: "SHIPMENT_LOADED" } }),
        ]),
      ([s, , n]) => s.status === "LOADED" && n >= 1
    );
    expect(dbShipment.status).toBe("LOADED");

    const loadedEvents = await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "LOADED" } });
    expect(loadedEvents).toBe(1);
    expect(loadedNotifications).toBe(1);

    // Bulk audit log records the action once per confirm click that actually claimed rows, but the
    // carton table itself must not double-flip — still exactly the shipment's single carton, LOADED.
    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id } });
    expect(cartons.every((c) => c.status === "LOADED")).toBe(true);

    await context1.close();
    await context2.close();
    await cleanupTenant(tenant.company.id);
  });
});
