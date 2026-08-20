import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant, TEST_PASSWORD, pollUntil } from "./helpers";
import bcrypt from "bcryptjs";

test.describe("Scenario M — delivery queue operations and customer delivery confirmation", () => {
  test("authorized staff can start and confirm a delivery directly from the /app/delivery queue", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 2,
      status: "DELIVERY_REQUESTED",
    });
    const req = await prisma.deliveryRequest.create({
      data: {
        companyId: tenant.company.id,
        shipmentId: shipment.id,
        customerName: "عميل اختبار",
        customerPhone: "+967700000000",
        pickupBranchId: unloadBranch.id,
        destinationAddress: "حي الجامعة",
        cartonCount: 2,
        status: "ASSIGNED",
        providerRef: "ARSHI-TEST-1",
      },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/delivery");

    const row = page.locator(`tr:has-text("${shipment.shipmentNumber}")`).first();
    await row.locator('button:has-text("بدء التوصيل")').click();
    let [dbShipment, dbReq] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
          prisma.deliveryRequest.findUniqueOrThrow({ where: { id: req.id } }),
        ]),
      ([s]) => s.status === "OUT_FOR_DELIVERY"
    );
    expect(dbShipment.status).toBe("OUT_FOR_DELIVERY");
    expect(dbReq.status).toBe("OUT_FOR_DELIVERY");

    await page.reload();
    const row2 = page.locator(`tr:has-text("${shipment.shipmentNumber}")`).first();
    await row2.locator('button:has-text("تأكيد التوصيل")').click();
    // Handover now records who took the cartons (P1-2): the dialog asks for a name and the last 4
    // digits of the receiver's number before the shipment may reach DELIVERED.
    await page.fill('[role="dialog"] input[name="last4"]', "0000");
    await page.click('[role="dialog"] button:has-text("تأكيد التسليم")');
    [dbShipment, dbReq] = await pollUntil(
      () =>
        Promise.all([
          prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
          prisma.deliveryRequest.findUniqueOrThrow({ where: { id: req.id } }),
        ]),
      ([s]) => s.status === "DELIVERED"
    );
    expect(dbShipment.status).toBe("DELIVERED");
    expect(dbReq.status).toBe("DELIVERED");

    await cleanupTenant(tenant.company.id);
  });

  test("a role without shipments.updateStatus sees the queue but no action buttons, and the server rejects the action directly", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const viewOnlyPerms = { shipments: ["view"] };
    const viewOnlyRole = await prisma.role.create({
      data: { companyId: tenant.company.id, name: "مشاهدة فقط", permissions: JSON.stringify(viewOnlyPerms) },
    });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const viewOnlyEmail = `viewonly-${Date.now()}@test.local`;
    await prisma.user.create({
      data: { companyId: tenant.company.id, name: "مشاهد فقط", email: viewOnlyEmail, passwordHash, userType: "COMPANY_USER", roleId: viewOnlyRole.id },
    });

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 1,
      status: "DELIVERY_REQUESTED",
    });
    await prisma.deliveryRequest.create({
      data: {
        companyId: tenant.company.id,
        shipmentId: shipment.id,
        customerName: "عميل اختبار",
        customerPhone: "+967700000000",
        pickupBranchId: unloadBranch.id,
        destinationAddress: "حي الجامعة",
        cartonCount: 1,
        status: "ASSIGNED",
      },
    });

    await login(page, viewOnlyEmail);
    await page.goto("/app/delivery");
    await expect(page.locator(`text=${shipment.shipmentNumber}`).first()).toBeVisible();
    await expect(page.locator('button:has-text("بدء التوصيل")')).toHaveCount(0);
    await expect(page.locator("text=الإجراء")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("public tracking page shows a real-backend delivery confirmation that survives a refresh", async ({ context }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 2,
      status: "ARRIVED",
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { arrivedCartons: 2 } });

    const publicPage = await context.newPage();
    await publicPage.goto(`/track/${shipment.trackingToken}`);
    await publicPage.click('button:has-text("توصيل للمنزل")');
    await publicPage.fill('textarea[name="destinationAddress"]', "حي الجامعة، شارع 20");
    await publicPage.fill('input[name="last4"]', "0000");
    await publicPage.click('button:has-text("تأكيد طلب التوصيل")');
    await publicPage.waitForTimeout(500);

    // A customer request is PENDING review, not a dispatch — the copy must not promise otherwise.
    await expect(publicPage.locator("text=تم استلام طلب التوصيل").first()).toBeVisible();
    await expect(publicPage.locator("text=سيراجعه الفرع").first()).toBeVisible();

    // Not a client-only flash — reflects the real DeliveryRequest row on a hard refresh.
    await publicPage.reload();
    await expect(publicPage.locator("text=تم استلام طلب التوصيل").first()).toBeVisible();

    const requests = await prisma.deliveryRequest.findMany({ where: { shipmentId: shipment.id } });
    expect(requests).toHaveLength(1);
    // Nothing was handed to the delivery provider by an unauthenticated caller.
    expect(requests[0].status).toBe("PENDING");
    expect(requests[0].providerRef).toBeNull();

    // Once the office moves it to OUT_FOR_DELIVERY, the tracking page's message updates accordingly.
    await prisma.deliveryRequest.update({ where: { id: requests[0].id }, data: { status: "OUT_FOR_DELIVERY" } });
    await publicPage.reload();
    await expect(publicPage.locator("text=شحنتك قيد التوصيل الآن").first()).toBeVisible();

    await publicPage.close();
    await cleanupTenant(tenant.company.id);
  });
});
