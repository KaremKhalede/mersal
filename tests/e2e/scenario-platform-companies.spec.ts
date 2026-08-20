import { test, expect } from "@playwright/test";
import { prisma, createTestPlatformAdmin, createTestTenant, createTestShipment, login, cleanupTenant } from "./helpers";

/** صفحة الشركات في لوحة المنصة — /platform/companies */
test.describe("Scenario — platform companies list", () => {
  test("lists company identity and lifecycle, and links out to its billing", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 3 });

    await login(page, admin.email);
    await page.goto(`/platform/companies?q=${encodeURIComponent(tenant.company.name)}`);

    const row = page.locator("tbody tr", { hasText: tenant.company.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(tenant.company.slug);
    await expect(row).toContainText("نشطة");

    // Money lives on /platform/billing only — this page manages who the company is, not what it
    // owes, so the financial columns must not be duplicated here.
    await expect(page.getByRole("columnheader", { name: "المستحق (ريال)" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "الكراتين هذا الشهر" })).toHaveCount(0);
    await expect(row.locator(`a[href="/platform/billing/${tenant.company.id}"]`)).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("search narrows the list and the status filter excludes non-matching companies", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);

    await login(page, admin.email);

    await page.goto(`/platform/companies?q=${encodeURIComponent(tenant.company.name)}`);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    // The company is ACTIVE, so filtering to SUSPENDED must drop it.
    await page.goto(`/platform/companies?q=${encodeURIComponent(tenant.company.name)}&status=SUSPENDED`);
    await expect(page.locator("text=لا توجد شركات مطابقة لبحثك")).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("suspending a company from the row menu updates its status and badge", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);

    await login(page, admin.email);
    await page.goto(`/platform/companies?q=${encodeURIComponent(tenant.company.name)}`);

    await page.getByRole("button", { name: "إجراءات الشركة" }).first().click();
    await page.getByRole("menuitem", { name: "إيقاف الشركة" }).click();
    await expect(page.locator("text=تم إيقاف الشركة")).toBeVisible();

    await expect
      .poll(async () => (await prisma.company.findUniqueOrThrow({ where: { id: tenant.company.id } })).status)
      .toBe("SUSPENDED");

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("pagination keeps the active filters in its links", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    await page.goto("/platform/companies?status=ACTIVE&pageSize=10");
    const next = page.locator('a[href*="page=2"]').first();
    if (await next.count()) {
      await expect(next).toHaveAttribute("href", /status=ACTIVE/);
    }

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a company user cannot reach the platform companies page", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await login(page, tenant.adminEmail);
    await page.goto("/platform/companies");
    await expect(page).not.toHaveURL(/\/platform\/companies$/);

    await cleanupTenant(tenant.company.id);
  });
});
