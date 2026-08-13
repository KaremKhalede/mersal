import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, login, TEST_PASSWORD, cleanupTenant } from "./helpers";
import bcrypt from "bcryptjs";

test.describe("Scenario K — final security scenarios (RBAC + unauthenticated access)", () => {
  test("a role without 'billing.view' is redirected away from /app/billing even by direct URL", async ({ page }) => {
    const tenant = await createTestTenant();

    // A limited role that can see shipments but nothing about money
    const limitedRole = await prisma.role.create({
      data: {
        companyId: tenant.company.id,
        name: "موظف محدود الصلاحيات",
        permissions: JSON.stringify({ shipments: ["view"] }),
      },
    });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const limitedEmail = `limited-${Date.now()}@test.local`;
    await prisma.user.create({
      data: { companyId: tenant.company.id, name: "موظف محدود", email: limitedEmail, passwordHash, userType: "COMPANY_USER", roleId: limitedRole.id },
    });

    await login(page, limitedEmail);
    await expect(page).toHaveURL(/\/app$/);

    // The sidebar hides billing, but the real guard has to be the page itself
    await page.goto("/app/billing");
    await expect(page).toHaveURL(/\/app$/);

    await page.goto("/app/employees");
    await expect(page).toHaveURL(/\/app$/);

    // Shipments is granted — same session must still be allowed in there
    await page.goto("/app/shipments");
    await expect(page).toHaveURL(/\/app\/shipments/);

    await cleanupTenant(tenant.company.id);
  });

  test("unauthenticated request to the company dashboard is redirected to login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/app/billing");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login/);
  });
});
