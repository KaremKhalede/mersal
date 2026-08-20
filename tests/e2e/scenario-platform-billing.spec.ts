import { test, expect } from "@playwright/test";
import { prisma, createTestPlatformAdmin, createTestTenant, createTestShipment, login, cleanupTenant } from "./helpers";

const monthOf = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** الفوترة — /platform/billing (usage + billing merged into one page). */
test.describe("Scenario — platform billing", () => {
  test("cartons, due, collected, remaining and collection rate are derived from the ledger", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    // 4 cartons @ the platform fee (5) => due 20.00
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 4 });
    // A 5.00 settlement => collected 5.00, remaining 15.00, rate 25%, status PARTIAL
    await prisma.billingLedgerEntry.create({
      data: { companyId: tenant.company.id, cartonCount: 0, feePerCarton: 0, amount: -5, entryType: "SETTLEMENT" },
    });

    await login(page, admin.email);
    await page.goto(`/platform/billing?q=${encodeURIComponent(tenant.company.name)}`);

    await expect(page.getByRole("heading", { name: "الفوترة" })).toBeVisible();
    const row = page.locator("tbody tr", { hasText: tenant.company.name });
    await expect(row).toContainText("4");
    await expect(row).toContainText("20.00"); // due
    await expect(row).toContainText("5.00"); // collected
    await expect(row).toContainText("15.00"); // remaining
    await expect(row).toContainText("25%");
    await expect(row).toContainText("مدفوعة جزئياً");

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("the carton fee comes from platform settings, not a hard-coded 5", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const platform = await prisma.platform.findFirstOrThrow();
    const original = platform.feePerCartonYER;

    try {
      await prisma.platform.update({ where: { id: platform.id }, data: { feePerCartonYER: 7.5 } });
      await login(page, admin.email);
      await page.goto("/platform/billing");
      await expect(page.locator("text=سعر الاستخدام: 7.50 ر.ي / كرتون")).toBeVisible();
    } finally {
      await prisma.platform.update({ where: { id: platform.id }, data: { feePerCartonYER: original } });
    }

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("payment-status filter is applied in the query, not the browser", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 2 });

    await login(page, admin.email);
    const q = encodeURIComponent(tenant.company.name);

    // Nothing settled yet -> UNPAID matches, PAID does not.
    await page.goto(`/platform/billing?q=${q}&status=UNPAID`);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.goto(`/platform/billing?q=${q}&status=PAID`);
    await expect(page.locator("text=لا توجد شركات مطابقة لبحثك")).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a fully settled company reads as مدفوعة at 100%", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 3 });
    await prisma.billingLedgerEntry.create({
      data: { companyId: tenant.company.id, cartonCount: 0, feePerCarton: 0, amount: -15, entryType: "SETTLEMENT" },
    });

    await login(page, admin.email);
    await page.goto(`/platform/billing?q=${encodeURIComponent(tenant.company.name)}&status=PAID`);
    const row = page.locator("tbody tr", { hasText: tenant.company.name });
    await expect(row).toContainText("100%");
    await expect(row).toContainText("مدفوعة");

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("changing the month re-queries that period", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 6 });

    await login(page, admin.email);
    await page.goto(`/platform/billing?month=${monthOf()}&q=${encodeURIComponent(tenant.company.name)}`);
    await expect(page.locator("tbody tr", { hasText: tenant.company.name })).toHaveCount(1);

    await page.selectOption('select[aria-label="اختر الشهر"]', { index: 1 });
    await expect(page).toHaveURL(/\/platform\/billing\?month=\d{4}-\d{2}/);

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("the daily view is gone — only the company breakdown remains", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    await page.goto("/platform/billing");
    await expect(page.getByRole("link", { name: "حسب اليوم" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "حسب الشركات" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "الشركة" })).toBeVisible();

    // A stale ?view=daily link must fall back to the company table, not render an empty page.
    await page.goto("/platform/billing?view=daily");
    await expect(page.getByRole("columnheader", { name: "الشركة" })).toBeVisible();

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("company detail shows the breakdown and the payment history", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 4 });
    await prisma.billingLedgerEntry.create({
      data: { companyId: tenant.company.id, cartonCount: 0, feePerCarton: 0, amount: -12, entryType: "SETTLEMENT", note: "تحويل بنكي" },
    });

    await login(page, admin.email);
    await page.goto(`/platform/billing?q=${encodeURIComponent(tenant.company.name)}`);
    await page.getByRole("link", { name: /عرض التفاصيل/ }).first().click();

    await expect(page).toHaveURL(/\/platform\/billing\/[^/]+\?month=/);
    await expect(page.getByRole("heading", { name: tenant.company.name })).toBeVisible();
    await expect(page.locator("text=سجل المدفوعات")).toBeVisible();
    await expect(page.locator("text=تحويل بنكي")).toBeVisible();
    await expect(page.locator("text=12.00").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("usage is no longer a separate page or sidebar entry", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    await expect(page.locator('aside nav a[href="/platform/usage"]')).toHaveCount(0);
    await expect(page.locator('aside nav a[href="/platform/billing"]')).toBeVisible();

    const res = await page.goto("/platform/usage");
    expect(res?.status()).toBe(404);

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a company user cannot reach platform billing or a company's billing detail", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await login(page, tenant.adminEmail);

    await page.goto("/platform/billing");
    await expect(page).not.toHaveURL(/\/platform\/billing$/);

    await page.goto(`/platform/billing/${tenant.company.id}`);
    await expect(page).not.toHaveURL(/\/platform\/billing\//);

    await cleanupTenant(tenant.company.id);
  });
});
