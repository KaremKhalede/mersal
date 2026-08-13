import { test, expect } from "@playwright/test";
import { createTestTenant, createTestShipment, createBranchScopedUser, login, cleanupTenant } from "./helpers";

/** Phase 5 P1 batch 1, item 1 — company dashboard finance section. */
test.describe("Scenario S — company dashboard finance summary", () => {
  test("collected-today, outstanding, and platform-fees-this-month are correct and branch-scoped", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    // Touches branch A, paid today: counts toward both "today" and outstanding for A.
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 2,
      shippingPrice: 1000, amountPaid: 400, paymentDate: today,
    });
    // Touches only B/C, paid today, fully paid: counts toward company-wide "today" only, not
    // branch-A's numbers, and contributes 0 to outstanding either way (fully paid).
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 3,
      shippingPrice: 2000, amountPaid: 2000, paymentDate: today,
    });
    // Touches branch A, paid YESTERDAY: must NOT count toward "collected today" (date boundary),
    // but its open balance still counts toward "outstanding" (outstanding has no date filter).
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 500, amountPaid: 300, paymentDate: yesterday,
    });

    // Company Admin — company-wide.
    await login(page, tenant.adminEmail);
    await page.goto("/app");
    await expect(page.locator("text=ملخص مالي")).toBeVisible();
    await expect(page.locator(`text=${(400 + 2000).toLocaleString()} ر.ي`)).toBeVisible(); // collected today
    await expect(page.locator(`text=${(600 + 0 + 200).toLocaleString()} ر.ي`)).toBeVisible(); // outstanding
    await expect(page.locator(`text=${(2 * 5 + 3 * 5 + 1 * 5).toLocaleString()} ر.ي`)).toBeVisible(); // platform fees MTD

    // Branch Employee at branch A, WITH billing.view — sees only branch-A numbers.
    const branchEmployee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { billing: ["view"] },
    });
    await login(page, branchEmployee.email);
    await page.goto("/app");
    await expect(page.locator("text=ملخص مالي")).toBeVisible();
    await expect(page.locator(`text=${(400).toLocaleString()} ر.ي`)).toBeVisible(); // only shipment 1 paid today
    await expect(page.locator(`text=${(600 + 200).toLocaleString()} ر.ي`)).toBeVisible(); // shipments 1 + 3 (both touch A)
    await expect(page.locator(`text=${(2 * 5 + 1 * 5).toLocaleString()} ر.ي`)).toBeVisible(); // shipments 1 + 3 fees

    // Branch Employee WITHOUT billing.view — no finance section at all (RBAC gate, not just hidden numbers).
    const noBillingEmployee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { shipments: ["view"] },
    });
    await login(page, noBillingEmployee.email);
    await page.goto("/app");
    await expect(page.locator("text=ملخص مالي")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("fractional shipping prices round-trip exactly (Decimal, not float)", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1,
      shippingPrice: 100.1, amountPaid: 33.3, paymentDate: new Date(),
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app");
    // 100.1 - 33.3 = 66.8 exactly — a naive float subtraction (100.1 - 33.3) drifts to
    // 66.79999999999998 in plain JS; toMoney()'s Decimal-backed conversion must not carry that.
    await expect(page.locator("text=33.3 ر.ي")).toBeVisible();
    await expect(page.locator("text=66.8 ر.ي")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
