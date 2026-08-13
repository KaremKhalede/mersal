import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario A — normal shipment lifecycle", () => {
  test("register -> receive -> trip -> load -> depart -> unload -> pickup -> delivered", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 3,
      status: "REGISTERED",
    });

    await login(page, tenant.adminEmail);

    // 1. Receive
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("استلام الشحنة")');
    await expect(page.locator("text=تم الاستلام").first()).toBeVisible();

    // 2. Create a trip with the two branches as load/unload stops
    await page.goto("/app/trips");
    await page.click('button:has-text("رحلة جديدة")');
    await page.getByTestId("new-trip-stop-0").locator('button[role="combobox"]').click();
    await page.locator(`[role="option"]:has-text("${loadBranch.name}")`).click();
    await page.getByTestId("new-trip-stop-1").locator('button[role="combobox"]').click();
    await page.locator(`[role="option"]:has-text("${unloadBranch.name}")`).click();
    await page.click('button:has-text("إنشاء الرحلة")');
    await page.waitForURL(/\/app\/trips\//);

    const tripUrl = page.url();
    const tripId = tripUrl.split("/trips/")[1];
    const stops = await prisma.tripStop.findMany({ where: { tripId }, orderBy: { sequence: "asc" } });
    const [stop1, stop2] = stops;

    const stop1Card = page.getByTestId(`stop-${stop1.id}`);
    const stop2Card = page.getByTestId(`stop-${stop2.id}`);

    // 3. Assign the shipment to the trip's loading stop
    await stop1Card.locator('button:has-text("ربط شحنة")').click();
    await page.locator(`[role="dialog"] label:has-text("${shipment.shipmentNumber}")`).click();
    await page.click('[role="dialog"] button:has-text("ربط")');
    await expect(stop1Card.locator(`text=${shipment.shipmentNumber}`)).toBeVisible();

    // 4. Confirm bulk loading at stop 1
    await stop1Card.locator('button:has-text("تأكيد التحميل")').click();
    let dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "LOADED"
    );
    expect(dbShipment.status).toBe("LOADED");

    // 5. Depart stop 1 -> IN_TRANSIT
    await stop1Card.locator('button:has-text("مغادرة المحطة")').click();
    dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "IN_TRANSIT"
    );
    expect(dbShipment.status).toBe("IN_TRANSIT");

    // 6. Confirm bulk unloading at stop 2 -> ARRIVED
    await page.goto(tripUrl);
    await stop2Card.locator('button:has-text("تأكيد التفريغ")').click();
    dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "ARRIVED"
    );
    expect(dbShipment.status).toBe("ARRIVED");
    expect(dbShipment.arrivedCartons).toBe(3);

    // 7. Ready for pickup, then confirm branch pickup -> DELIVERED
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("وضع جاهزة للاستلام")');
    await expect(page.locator("text=جاهزة للاستلام").first()).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.click('button:has-text("تسليم من الفرع")');
    dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "DELIVERED"
    );
    expect(dbShipment.status).toBe("DELIVERED");

    // 8. Public tracking page reflects the final state without any auth
    const trackPage = await page.context().newPage();
    await trackPage.goto(`/track/${shipment.shipmentNumber}`);
    await expect(trackPage.locator("text=تم التسليم").first()).toBeVisible();
    await trackPage.close();

    await cleanupTenant(tenant.company.id);
  });
});
