import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario B — partial arrival", () => {
  test("5 cartons, only 3 arrive -> PARTIALLY_ARRIVED, then remaining 2 arrive -> ARRIVED", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 5,
      status: "READY_FOR_LOADING",
    });

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: loadBranch.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: unloadBranch.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const [stop1, stop2] = trip.stops;
    await linkShipmentToTrip(trip.id, shipment.id, stop1.id, stop2.id);

    await login(page, tenant.driverEmail);
    await page.click('a:has-text("عرض تفاصيل الرحلة")');
    await page.waitForURL(/\/driver\/trip\//);

    const stop1Card = page.getByTestId(`stop-${stop1.id}`);
    await stop1Card.locator('button:has-text("تأكيد التحميل")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "LOADED"
    );
    await stop1Card.locator('button:has-text("مغادرة المحطة")').click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "IN_TRANSIT"
    );

    // Report only 3 of 5 cartons physically present instead of confirming a full bulk unload
    await page.click('a:has-text("الإبلاغ عن مشكلة")');
    await page.waitForURL(/report-problem/);
    await page.locator('button[role="combobox"]').first().click();
    await page.locator(`[role="option"]:has-text("${shipment.shipmentNumber}")`).click();
    await page.fill("#arrivedCartons", "3");
    await page.click('button:has-text("إرسال البلاغ")');
    // Careful: `/driver/trip/` also matches this very page's own URL (.../report-problem), so a
    // loose regex here would resolve immediately without ever waiting for the redirect back.
    await page.waitForURL(new RegExp(`/driver/trip/${trip.id}$`));

    let dbShipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(dbShipment.status).toBe("PARTIALLY_ARRIVED");
    expect(dbShipment.arrivedCartons).toBe(3);

    // The trip's unload bookkeeping must be reconciled too, not just the shipment status
    const link = await prisma.tripShipmentStop.findFirstOrThrow({ where: { tripId: trip.id, shipmentId: shipment.id } });
    expect(link.unloadedAt).not.toBeNull();
    expect(link.cartonsUnloaded).toBe(3);

    // Customer tracking communicates the partial count in plain language
    const trackPage = await page.context().newPage();
    await trackPage.goto(`/track/${shipment.shipmentNumber}`);
    await expect(trackPage.locator("text=وصل 3 من أصل 5")).toBeVisible();
    await trackPage.close();

    // Company admin confirms the remaining 2 cartons arrived later
    const adminPage = await page.context().newPage();
    await login(adminPage, tenant.adminEmail);
    await adminPage.goto(`/app/shipments/${shipment.id}`);
    adminPage.once("dialog", (d) => d.accept()); // this action asks for confirmation first
    await adminPage.click('button:has-text("تأكيد وصول الباقي")');
    dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "ARRIVED"
    );
    expect(dbShipment.status).toBe("ARRIVED");
    expect(dbShipment.arrivedCartons).toBe(5);

    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id } });
    expect(cartons.every((c) => c.status === "ARRIVED")).toBe(true);

    await adminPage.close();
    await cleanupTenant(tenant.company.id);
  });
});
