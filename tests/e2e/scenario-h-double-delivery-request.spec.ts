import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario H — double delivery request submit must not create two Arshi orders", () => {
  test("two concurrent home-delivery submissions yield exactly one DeliveryRequest", async ({ browser }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 2,
      status: "ARRIVED",
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { currentBranchId: unloadBranch.id, arrivedCartons: 2 } });

    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    await login(page1, tenant.adminEmail);
    await login(page2, tenant.adminEmail);

    for (const p of [page1, page2]) {
      await p.goto(`/app/shipments/${shipment.id}`);
      await p.click('button:has-text("التوصيل")');
      await p.fill('textarea[name="destinationAddress"]', "عنوان اختبار للتوصيل");
    }

    await Promise.all([
      page1.click('button:has-text("طلب توصيل إلى المنزل")'),
      page2.click('button:has-text("طلب توصيل إلى المنزل")'),
    ]);
    // Status flips as part of creating the DeliveryRequest, but the customer notification is
    // dispatched as a separate step afterward — poll for it too, not just status.
    const [dbShipment, , notifications] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
          prisma.deliveryRequest.count({ where: { shipmentId: shipment.id } }),
          prisma.notificationLog.count({ where: { shipmentId: shipment.id, event: "DELIVERY_REQUESTED" } }),
        ]),
      ([s, , n]) => s.status === "DELIVERY_REQUESTED" && n >= 1
    );
    expect(dbShipment.status).toBe("DELIVERY_REQUESTED");

    const requests = await prisma.deliveryRequest.findMany({ where: { shipmentId: shipment.id } });
    expect(requests.length).toBe(1);
    expect(notifications).toBe(1);

    await context1.close();
    await context2.close();
    await cleanupTenant(tenant.company.id);
  });
});
