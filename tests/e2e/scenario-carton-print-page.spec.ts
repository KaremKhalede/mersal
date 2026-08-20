import { test, expect } from "@playwright/test";
import { createTestTenant, createTestShipment, createBranchScopedUser, login, cleanupTenant } from "./helpers";

/** The redesigned "طباعة أكواد الكراتين" carton-print page (src/app/app/shipments/[id]/label). */
test.describe("Scenario — carton print page", () => {
  test("breadcrumb, heading, banner, and one QR + one decorative barcode per carton by default", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 3 });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/label`);

    await expect(page.locator("nav[aria-label='breadcrumb']").getByText("الشحنات")).toBeVisible();
    await expect(page.locator("nav[aria-label='breadcrumb']").getByText("طباعة أكواد الكراتين")).toBeVisible();
    await expect(page.locator("nav[aria-label='breadcrumb']").getByText(shipment.shipmentNumber)).toBeVisible();
    await expect(page.getByRole("heading", { name: "طباعة أكواد الكراتين" })).toBeVisible();
    await expect(page.locator(`text=إجمالي الكراتين: 3 كرتون`)).toBeVisible();

    await expect(page.locator('[data-testid="carton-qr"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="carton-barcode"]')).toHaveCount(3);

    await cleanupTenant(tenant.company.id);
  });

  test("print options can hide the barcode or the QR independently", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 2 });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/label`);

    await page.getByRole("button", { name: "خيارات الطباعة" }).click();
    await page.getByRole("menuitemcheckbox", { name: "إظهار الباركود" }).click();
    await expect(page.locator('[data-testid="carton-barcode"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="carton-qr"]')).toHaveCount(2); // QR untouched

    await page.getByRole("button", { name: "خيارات الطباعة" }).click();
    await page.getByRole("menuitemcheckbox", { name: "إظهار رمز QR" }).click();
    await expect(page.locator('[data-testid="carton-qr"]')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("pagination limits the on-screen grid, but the preview toggle and print always show every carton", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 12 });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/label`);

    // Default page size is 10 — only 10 of 12 cartons are visible on screen.
    await expect(page.locator('[data-testid="carton-qr"]:visible')).toHaveCount(10);

    await page.getByRole("button", { name: "معاينة قبل الطباعة" }).click();
    await expect(page.locator('[data-testid="carton-qr"]:visible')).toHaveCount(12);

    await page.getByRole("button", { name: "معاينة قبل الطباعة" }).click();
    await expect(page.locator('[data-testid="carton-qr"]:visible')).toHaveCount(10);

    await page.emulateMedia({ media: "print" });
    const printCount = await page.locator('[data-testid="carton-qr"]').evaluateAll(
      (els) => els.filter((el) => getComputedStyle(el.closest(".carton-print-card")!).display !== "none").length
    );
    expect(printCount).toBe(12);

    await cleanupTenant(tenant.company.id);
  });

  test("copy-code button copies a carton's code", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1 });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/label`);
    await page.getByRole("button", { name: "نسخ الكود" }).first().click();
    await expect(page.locator("text=تم نسخ كود الكرتون")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment with no cartons shows the empty state, not a broken grid", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 0 });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/label`);
    await expect(page.locator("text=لا توجد كراتين مسجّلة لهذه الشحنة")).toBeVisible();
    await expect(page.locator('[data-testid="carton-qr"]')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a role without shipments.view is redirected away from the print page", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1 });
    const employee = await createBranchScopedUser({ companyId: tenant.company.id, branchId: branchA.id, permissions: { trips: ["view"] } });

    await login(page, employee.email);
    await page.goto(`/app/shipments/${shipment.id}/label`);
    await expect(page).toHaveURL(/\/app$/);

    await cleanupTenant(tenant.company.id);
  });
});
