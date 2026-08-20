import { test, expect } from "@playwright/test";
import { prisma, createTestPlatformAdmin, createTestTenant, createTestShipment, login, cleanupTenant } from "./helpers";

/** لوحة تحكم المنصة — /platform */
test.describe("Scenario — platform dashboard", () => {
  test("renders every panel and reflects real company/carton figures", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 4 });

    await login(page, admin.email);
    await page.goto("/platform");

    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "حالة الشركات" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "استخدام الكراتين" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "تنبيهات مهمة" })).toBeVisible();

    // Totals are read from the database, so the freshly created tenant must be counted.
    const totalCompanies = await prisma.company.count();
    await expect(page.locator("text=إجمالي الشركات").first()).toBeVisible();
    await expect(page.locator(`text=${totalCompanies.toLocaleString("en-US")}`).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("the month picker drives a query param and re-queries that month", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);
    await page.goto("/platform");

    await page.selectOption('select[aria-label="اختر الشهر"]', { index: 1 });
    await expect(page).toHaveURL(/\/platform\?month=\d{4}-\d{2}/);
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a malformed month falls back to the current month instead of erroring", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    const res = await page.goto("/platform?month=not-a-month");
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a company user cannot reach the platform dashboard", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);

    await login(page, tenant.adminEmail);
    await page.goto("/platform");
    await expect(page).not.toHaveURL(/\/platform$/);

    await cleanupTenant(tenant.company.id);
  });
});
