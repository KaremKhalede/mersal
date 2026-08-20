import { test, expect } from "@playwright/test";
import { prisma, createTestPlatformAdmin, createTestTenant, login, cleanupTenant } from "./helpers";

/** نطاق لوحة المنصة في الـMVP: خمس وجهات فقط. */
test.describe("Scenario — platform navigation scope", () => {
  const EXPECTED = ["الرئيسية", "الشركات", "الفوترة", "مستخدمو المنصة", "إعدادات المنصة"];
  const REMOVED = [
    "سجل النشاطات",
    "الدعم",
    "الاستخدام",
    "الشحنات",
    "الرحلات",
    "طلبات التوصيل",
    "العملاء",
    "الفروع",
    "المركبات",
    "المستندات",
    "الأدوار والصلاحيات",
  ];

  test("the sidebar contains exactly the five MVP destinations", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    const nav = page.locator("aside nav");
    for (const label of EXPECTED) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    for (const label of REMOVED) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
    await expect(nav.getByRole("link")).toHaveCount(EXPECTED.length);

    // No empty group headings left behind after the removal.
    await expect(nav.locator("p", { hasText: "النظام" })).toBeVisible();

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("every out-of-scope platform route is gone, and nothing links to one", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    // Deleted outright rather than merely unlinked — a URL-reachable page missing from the nav is
    // the exact technical debt this cleanup removes.
    const REMOVED_ROUTES = [
      "/platform/audit",
      "/platform/shipments",
      "/platform/trips",
      "/platform/delivery",
      "/platform/reports",
      "/platform/support",
    ];
    for (const path of REMOVED_ROUTES) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }

    for (const path of ["/platform", "/platform/companies", "/platform/billing", "/platform/users", "/platform/settings"]) {
      await page.goto(path);
      for (const dead of REMOVED_ROUTES) {
        await expect(page.locator(`a[href="${dead}"]`), `${path} -> ${dead}`).toHaveCount(0);
      }
    }

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("every remaining platform destination still loads", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    for (const path of ["/platform", "/platform/companies", "/platform/billing", "/platform/users", "/platform/settings"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
    }

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("the company-side activity view is untouched by the platform cleanup", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await login(page, tenant.adminEmail);

    // Audit logging still feeds the company's own activity page.
    const res = await page.goto("/app/activity");
    expect(res?.status()).toBe(200);

    await cleanupTenant(tenant.company.id);
  });
});
