import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createBranchScopedUser, login, cleanupTenant, pollUntil } from "./helpers";

/** إعدادات الشركة — the company profile form at /app/settings/company. */
test.describe("Scenario — company settings", () => {
  test("saves the full company profile and reloads it from the database", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);

    await login(page, tenant.adminEmail);
    await page.goto("/app/settings/company");

    await expect(page.getByRole("heading", { name: "إعدادات الشركة" })).toBeVisible();

    await page.fill('input[name="name"]', "مؤسسة النور للشحن");
    await page.fill('input[name="nameEn"]', "Al Noor Shipping Est.");
    await page.fill('textarea[name="description"]', "خدمات الشحن البري والبحري والجوي.");
    await page.fill('input[name="phone"]', "+966501234567");
    await page.fill('input[name="email"]', "info@alnoorshipping.com");
    await page.fill('input[name="website"]', "https://alnoorshipping.com");
    await page.fill('input[name="address"]', "الرياض، المملكة العربية السعودية");
    await page.click('button:has-text("حفظ التغييرات")');

    await expect(page.locator("text=تم حفظ التغييرات")).toBeVisible();

    const saved = await pollUntil(
      () => prisma.company.findUniqueOrThrow({ where: { id: tenant.company.id } }),
      (c) => c.nameEn === "Al Noor Shipping Est."
    );
    expect(saved.name).toBe("مؤسسة النور للشحن");
    expect(saved.description).toBe("خدمات الشحن البري والبحري والجوي.");
    expect(saved.website).toBe("https://alnoorshipping.com");
    expect(saved.address).toBe("الرياض، المملكة العربية السعودية");

    // Values survive a reload — they're read back from the DB, not just left in the DOM.
    await page.reload();
    await expect(page.locator('input[name="nameEn"]')).toHaveValue("Al Noor Shipping Est.");
    await expect(page.locator('input[name="website"]')).toHaveValue("https://alnoorshipping.com");

    await cleanupTenant(tenant.company.id);
  });

  test("rejects a malformed website and leaves the stored value untouched", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await prisma.company.update({ where: { id: tenant.company.id }, data: { website: "https://good.example" } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/settings/company");

    await page.fill('input[name="nameEn"]', "Test Co");
    await page.fill('input[name="email"]', "owner@example.com");
    await page.fill('input[name="website"]', "not-a-url");
    await page.click('button:has-text("حفظ التغييرات")');

    await expect(page.locator("text=الموقع الإلكتروني يجب أن يبدأ بـ")).toBeVisible();

    const company = await prisma.company.findUniqueOrThrow({ where: { id: tenant.company.id } });
    expect(company.website).toBe("https://good.example");

    await cleanupTenant(tenant.company.id);
  });

  test("clearing an optional field stores null rather than an empty string", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await prisma.company.update({ where: { id: tenant.company.id }, data: { address: "عنوان قديم" } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/settings/company");
    await page.fill('input[name="nameEn"]', "Test Co");
    await page.fill('input[name="email"]', "owner@example.com");
    await page.fill('input[name="address"]', "");
    await page.click('button:has-text("حفظ التغييرات")');

    const company = await pollUntil(
      () => prisma.company.findUniqueOrThrow({ where: { id: tenant.company.id } }),
      (c) => c.address === null
    );
    expect(company.address).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("required fields are enforced server-side, not only by the required attribute", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);

    await login(page, tenant.adminEmail);
    await page.goto("/app/settings/company");

    // Strip the client-side guards, then submit — the server must still reject it.
    await page.evaluate(() => {
      document.querySelectorAll("input[required]").forEach((el) => el.removeAttribute("required"));
    });
    await page.fill('input[name="nameEn"]', "");
    await page.fill('input[name="email"]', "owner@example.com");
    await page.click('button:has-text("حفظ التغييرات")');

    await expect(page.locator("text=اسم الشركة بالإنجليزية مطلوب")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a role without settings.view is redirected away", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { shipments: ["view"] },
    });

    await login(page, employee.email);
    await page.goto("/app/settings/company");
    await expect(page).toHaveURL(/\/app$/);

    await cleanupTenant(tenant.company.id);
  });

  test("the logo route 404s for a company that has not uploaded one", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await login(page, tenant.adminEmail);

    const res = await page.request.get("/api/company/logo");
    expect(res.status()).toBe(404);

    await cleanupTenant(tenant.company.id);
  });
});
