import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario D — multiple loading points on one trip", () => {
  test("trip inventory grows correctly as a second stop loads additional shipments", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;

    const shipmentFromA = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: branchA.id,
      unloadBranchId: branchC.id,
      cartonCount: 3,
    });
    const shipmentFromB = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: branchB.id,
      unloadBranchId: branchC.id,
      cartonCount: 4,
    });

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const [stopA, stopB, stopC] = trip.stops;
    await linkShipmentToTrip(trip.id, shipmentFromA.id, stopA.id, stopC.id);
    await linkShipmentToTrip(trip.id, shipmentFromB.id, stopB.id, stopC.id);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    await page.getByTestId(`stop-${stopA.id}`).locator('button:has-text("تأكيد التحميل")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipmentFromA.id } }),
      (s) => s.status === "LOADED"
    );
    await page.getByTestId(`stop-${stopA.id}`).locator('button:has-text("مغادرة المحطة")').click();
    let onboard = await pollUntil(
      () => prisma.tripShipmentStop.count({ where: { tripId: trip.id, loadedAt: { not: null }, unloadedAt: null } }),
      (n) => n === 1
    );
    expect(onboard).toBe(1); // only shipmentFromA loaded so far

    await page.goto(`/app/trips/${trip.id}`);
    await page.getByTestId(`stop-${stopB.id}`).locator('button:has-text("تأكيد التحميل")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipmentFromB.id } }),
      (s) => s.status === "LOADED"
    );
    await page.getByTestId(`stop-${stopB.id}`).locator('button:has-text("مغادرة المحطة")').click();
    onboard = await pollUntil(
      () => prisma.tripShipmentStop.count({ where: { tripId: trip.id, loadedAt: { not: null }, unloadedAt: null } }),
      (n) => n === 2
    );
    expect(onboard).toBe(2); // both shipments now onboard after the second loading point

    const totalCartonsOnboard = await prisma.tripShipmentStop.aggregate({
      where: { tripId: trip.id, loadedAt: { not: null }, unloadedAt: null },
      _sum: { cartonsLoaded: true },
    });
    expect(totalCartonsOnboard._sum.cartonsLoaded).toBe(7); // 3 + 4

    // Final stop unloads both
    await page.goto(`/app/trips/${trip.id}`);
    await page.getByTestId(`stop-${stopC.id}`).locator('button:has-text("تأكيد التفريغ")').click();
    const [a, b] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipmentFromA.id } }),
          prisma.shipment.findUniqueOrThrow({ where: { id: shipmentFromB.id } }),
        ]),
      ([sa, sb]) => sa.status === "ARRIVED" && sb.status === "ARRIVED"
    );
    expect(a.status).toBe("ARRIVED");
    expect(b.status).toBe("ARRIVED");

    await cleanupTenant(tenant.company.id);
  });
});
