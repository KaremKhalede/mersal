import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, createBranchScopedUser, login, cleanupTenant } from "./helpers";

/** Phase 5 P1 batch 2, item 1 — trip-level bulk carton label printing. */
test.describe("Scenario V — bulk label printing (trip-oriented)", () => {
  test("prints exactly one label per carton across every shipment linked to the trip", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, , branchC] = tenant.branches;

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const shipment1 = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 2 });
    const shipment2 = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 3 });
    await linkShipmentToTrip(trip.id, shipment1.id, trip.stops[0].id, trip.stops[1].id);
    await linkShipmentToTrip(trip.id, shipment2.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.adminEmail);

    // The trip detail page links to it (opens in a new tab — just verify the href is wired up
    // correctly rather than juggling popup-window timing).
    await page.goto(`/app/trips/${trip.id}`);
    const labelsLink = page.locator('a:has-text("طباعة كل ملصقات الرحلة")');
    await expect(labelsLink).toHaveAttribute("href", `/app/trips/${trip.id}/labels`);

    await page.goto(`/app/trips/${trip.id}/labels`);

    // 2 + 3 = 5 cartons total, one QR each, regardless of which shipment they belong to.
    await expect(page.locator('[data-testid="carton-qr"]')).toHaveCount(5);
    await expect(page.locator(`text=${shipment1.shipmentNumber}`).first()).toBeVisible();
    await expect(page.locator(`text=${shipment2.shipmentNumber}`).first()).toBeVisible();
    await expect(page.locator("text=1 / 2")).toBeVisible();
    await expect(page.locator("text=2 / 2")).toBeVisible();
    await expect(page.locator("text=1 / 3")).toBeVisible();
    await expect(page.locator("text=3 / 3")).toBeVisible();

    const qrValues = await page.locator('[data-testid="carton-qr"]').evaluateAll((els) => els.map((el) => el.getAttribute("data-qr-value")));
    const allCartons = await prisma.carton.findMany({ where: { shipmentId: { in: [shipment1.id, shipment2.id] } } });
    expect(new Set(qrValues)).toEqual(new Set(allCartons.map((c) => c.cartonCode)));

    await cleanupTenant(tenant.company.id);
  });

  test("a trip with no linked shipments shows the empty state, not a broken/empty grid", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}/labels`);
    await expect(page.locator("text=لا توجد شحنات مرتبطة بهذه الرحلة بعد")).toBeVisible();
    await expect(page.locator('[data-testid="carton-qr"]')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a Branch Employee outside the trip's route cannot reach its bulk labels page", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchB.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const employeeAtA = await createBranchScopedUser({ companyId: tenant.company.id, branchId: branchA.id, permissions: { trips: ["view"] } });

    await login(page, employeeAtA.email);
    const res = await page.goto(`/app/trips/${trip.id}/labels`);
    expect(res?.status()).toBe(404);

    await cleanupTenant(tenant.company.id);
  });
});
