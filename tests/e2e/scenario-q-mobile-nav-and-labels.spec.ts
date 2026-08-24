import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestPlatformAdmin, login, cleanupTenant } from "./helpers";

test.describe("Scenario Q — mobile navigation and Arabic status/type labels (Phase 5 P0)", () => {
  test("company sidebar is reachable on a phone-sized viewport via the hamburger drawer", async ({ page }) => {
    const tenant = await createTestTenant();
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-class width, below the lg breakpoint

    await login(page, tenant.adminEmail);
    await expect(page).toHaveURL(/\/app$/);

    // The desktop <aside> is `hidden lg:flex` — at this viewport it must not be occupying space.
    await expect(page.locator("aside")).not.toBeVisible();

    const trigger = page.getByRole("button", { name: "فتح القائمة" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    const shipmentsLink = drawer.getByRole("link", { name: "الشحنات" });
    await expect(shipmentsLink).toBeVisible();
    await shipmentsLink.click();

    await expect(page).toHaveURL(/\/app\/shipments/);
    // Navigating closes the drawer (no dead overlay left blocking the page).
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("platform sidebar is reachable on a phone-sized viewport via the hamburger drawer", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, admin.email);
    await expect(page).toHaveURL(/\/platform$/);

    await expect(page.locator("aside")).not.toBeVisible();

    const trigger = page.getByRole("button", { name: "فتح القائمة" });
    await trigger.click();
    const drawer = page.getByRole("dialog");
    const companiesLink = drawer.getByRole("link", { name: "الشركات" });
    await expect(companiesLink).toBeVisible();
    await companiesLink.click();
    await expect(page).toHaveURL(/\/platform\/companies/);

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("desktop viewport shows the static sidebar, not the hamburger", async ({ page }) => {
    const tenant = await createTestTenant();
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, tenant.adminEmail);

    await expect(page.locator("aside")).toBeVisible();
    await expect(page.getByRole("button", { name: "فتح القائمة" })).not.toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("Documents list shows Arabic type labels, never the raw docType", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });
    await prisma.document.create({
      data: { companyId: tenant.company.id, shipmentId: shipment.id, docType: "INVOICE", fileName: "test.pdf", filePath: `${tenant.company.id}/test.pdf` },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/documents");
    await expect(page.locator("text=فاتورة")).toBeVisible();
    await expect(page.locator("text=INVOICE")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("Delivery requests list shows Arabic status labels, never the raw status", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
      status: "OUT_FOR_DELIVERY",
    });
    await prisma.deliveryRequest.create({
      data: {
        companyId: tenant.company.id,
        shipmentId: shipment.id,
        customerName: "عميل اختبار",
        customerPhone: "+967700000000",
        pickupBranchId: tenant.branches[1].id,
        destinationAddress: "حي الجامعة",
        cartonCount: 1,
        status: "OUT_FOR_DELIVERY",
      },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/delivery");
    // Scoped to the row: the queue now also has a "قيد التوصيل" counter above the table, and this
    // assertion is about the status badge on the request, not the count of them.
    await expect(page.locator("tbody").getByText("قيد التوصيل")).toBeVisible();
    await expect(page.locator("text=OUT_FOR_DELIVERY")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });
});
