import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario C — multi-stop routing with different destinations", () => {
  test("shipment A unloads at an intermediate stop while shipment B stays onboard past it", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج", "د"]);
    const [branchA, branchB, branchC, branchD] = tenant.branches;

    const shipmentToC = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: branchA.id,
      unloadBranchId: branchC.id,
      cartonCount: 2,
    });
    const shipmentToD = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: branchA.id,
      unloadBranchId: branchD.id,
      cartonCount: 2,
    });

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: false },
        { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true },
        { branchId: branchD.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const [stopA, stopB, stopC, stopD] = trip.stops;
    await linkShipmentToTrip(trip.id, shipmentToC.id, stopA.id, stopC.id);
    await linkShipmentToTrip(trip.id, shipmentToD.id, stopA.id, stopD.id);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    await page.getByTestId(`stop-${stopA.id}`).locator('button:has-text("تأكيد التحميل")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipmentToC.id } }),
      (s) => s.status === "LOADED"
    );
    await page.getByTestId(`stop-${stopA.id}`).locator('button:has-text("مغادرة المحطة")').click();
    let [toC, toD] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipmentToC.id } }),
          prisma.shipment.findUniqueOrThrow({ where: { id: shipmentToD.id } }),
        ]),
      ([c, d]) => c.status === "IN_TRANSIT" && d.status === "IN_TRANSIT"
    );
    expect(toC.status).toBe("IN_TRANSIT");
    expect(toD.status).toBe("IN_TRANSIT");

    // Pass through stop B — nothing to load/unload for either shipment there
    await page.goto(`/app/trips/${trip.id}`);
    await page.getByTestId(`stop-${stopB.id}`).locator('button:has-text("مغادرة المحطة")').click();
    await pollUntil(
      () => prisma.tripStop.findUniqueOrThrow({ where: { id: stopB.id } }),
      (s) => s.actualDeparture !== null
    );

    // Stop C: only shipmentToC should be unloaded
    await page.goto(`/app/trips/${trip.id}`);
    await page.getByTestId(`stop-${stopC.id}`).locator('button:has-text("تأكيد التفريغ")').click();
    // Unload is a dialog now (P1-5): every carton starts as arrived, so confirming without touching
    // anything is the "all of it came off" case.
    await page.click('[role="dialog"] button:has-text("تأكيد التفريغ")');

    [toC, toD] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipmentToC.id } }),
          prisma.shipment.findUniqueOrThrow({ where: { id: shipmentToD.id } }),
        ]),
      ([c]) => c.status === "ARRIVED"
    );
    expect(toC.status).toBe("ARRIVED");
    expect(toD.status).toBe("IN_TRANSIT"); // must NOT have been marked arrived at the intermediate stop

    await page.goto(`/app/trips/${trip.id}`);
    await page.getByTestId(`stop-${stopC.id}`).locator('button:has-text("مغادرة المحطة")').click();
    await pollUntil(
      () => prisma.tripStop.findUniqueOrThrow({ where: { id: stopC.id } }),
      (s) => s.actualDeparture !== null
    );

    // Stop D: shipmentToD finally unloads
    await page.goto(`/app/trips/${trip.id}`);
    await page.getByTestId(`stop-${stopD.id}`).locator('button:has-text("تأكيد التفريغ")').click();
    // Unload is a dialog now (P1-5): every carton starts as arrived, so confirming without touching
    // anything is the "all of it came off" case.
    await page.click('[role="dialog"] button:has-text("تأكيد التفريغ")');

    toD = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipmentToD.id } }),
      (s) => s.status === "ARRIVED"
    );
    expect(toD.status).toBe("ARRIVED");

    await cleanupTenant(tenant.company.id);
  });
});
