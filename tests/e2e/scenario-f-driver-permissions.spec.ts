import { test, expect } from "@playwright/test";
import { createTestTenant, login, cleanupTenant } from "./helpers";

test.describe("Scenario F — driver cannot reach company administration", () => {
  test("driver session redirects away from /app and /platform", async ({ page }) => {
    const tenant = await createTestTenant();

    await login(page, tenant.driverEmail);
    await expect(page).toHaveURL(/\/driver/);

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/app/billing");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/app/employees");
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/platform");
    await expect(page).toHaveURL(/\/login/);

    await cleanupTenant(tenant.company.id);
  });
});
