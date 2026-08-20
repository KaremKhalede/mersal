import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario G — concurrent double-unload must not corrupt state", () => {
  test("two simultaneous confirm-unload clicks process the shipment exactly once", async ({ browser }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 2,
    });

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: loadBranch.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: unloadBranch.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const [stop1, stop2] = trip.stops;
    await linkShipmentToTrip(trip.id, shipment.id, stop1.id, stop2.id);

    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    await login(page1, tenant.adminEmail);
    await page1.goto(`/app/trips/${trip.id}`);
    await page1.getByTestId(`stop-${stop1.id}`).locator('button:has-text("تأكيد التحميل")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "LOADED"
    );
    await page1.getByTestId(`stop-${stop1.id}`).locator('button:has-text("مغادرة المحطة")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "IN_TRANSIT"
    );

    // Two independent sessions land on the same stop and race to confirm unloading
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await login(page2, tenant.adminEmail);

    await page1.goto(`/app/trips/${trip.id}`);
    await page2.goto(`/app/trips/${trip.id}`);

    // Both open the unload dialog first (P1-5), then submit at the same moment — the race is on the
    // confirm, which is the only step that writes.
    await Promise.all([
      page1.getByTestId(`stop-${stop2.id}`).locator('button:has-text("تأكيد التفريغ")').click(),
      page2.getByTestId(`stop-${stop2.id}`).locator('button:has-text("تأكيد التفريغ")').click(),
    ]);
    await Promise.all([
      page1.click('[role="dialog"] button:has-text("تأكيد التفريغ")'),
      page2.click('[role="dialog"] button:has-text("تأكيد التفريغ")'),
    ]);
    // Status flips inside the same DB transaction as the tracking event, but the customer
    // notification is dispatched as a separate step afterward — poll for it too, not just status.
    const [dbShipment, , arrivedNotifications] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
          prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "ARRIVED" } }),
          prisma.notificationLog.count({ where: { shipmentId: shipment.id, event: "SHIPMENT_ARRIVED" } }),
        ]),
      ([s, , n]) => s.status === "ARRIVED" && n >= 1
    );
    expect(dbShipment.status).toBe("ARRIVED");
    expect(dbShipment.arrivedCartons).toBe(2);

    // Exactly one ARRIVED tracking event and one customer notification — the loser of the race
    // must have found nothing left to claim, not processed the shipment a second time
    const arrivedEvents = await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "ARRIVED" } });
    expect(arrivedEvents).toBe(1);
    expect(arrivedNotifications).toBe(1);

    const link = await prisma.tripShipmentStop.findFirstOrThrow({ where: { tripId: trip.id, shipmentId: shipment.id } });
    expect(link.cartonsUnloaded).toBe(2);

    await context1.close();
    await context2.close();
    await cleanupTenant(tenant.company.id);
  });
});
