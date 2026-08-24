import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant } from "./helpers";
import { recordPayment } from "@/modules/shipments/service";

test.describe("Scenario N — money is exact decimal, never floating point", () => {
  test("whole-number price fully paid -> remaining is exactly 0", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: loadBranch.id, unloadBranchId: unloadBranch.id, cartonCount: 3,
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shippingPrice: 45000, amountPaid: 45000, paymentMethod: "CASH" } });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expect(page.locator("text=45,000 ر.ي").first()).toBeVisible();
    await expect(page.locator("text=0 ر.ي").first()).toBeVisible(); // remaining

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(Number(db.shippingPrice) - Number(db.amountPaid)).toBe(0);

    await cleanupTenant(tenant.company.id);
  });

  test("partial payment leaves an exact non-zero remaining balance", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: loadBranch.id, unloadBranchId: unloadBranch.id, cartonCount: 4,
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shippingPrice: 30000 } });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("تسجيل دفعة")');
    await page.fill('input[name="amountPaid"]', "12500");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    // A fixed sleep is tuned for local latency and is too short against a real deployment's
    // serverless round-trip (function cold start + pooled DB write) — poll instead.
    await expect
      .poll(async () => Number((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).amountPaid))
      .toBe(12500);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(Number(db.amountPaid)).toBe(12500);
    const remaining = Number(db.shippingPrice) - Number(db.amountPaid);
    expect(remaining).toBe(17500);
    await expect(page.locator("text=17,500 ر.ي").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("fractional payment amounts round-trip with exact precision at the data layer (no float drift)", async () => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: loadBranch.id, unloadBranchId: unloadBranch.id, cartonCount: 4,
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shippingPrice: 30000 } });

    // Bypasses the <input type=number step=1> HTML constraint (a UI concern, out of scope here) to
    // prove the storage/read layer itself is exact — the classic 0.1+0.2 float bug would corrupt this.
    await recordPayment(shipment.id, { amountPaid: 12500.55, paymentMethod: "CASH" });

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(Number(db.amountPaid)).toBe(12500.55);
    const remaining = Number(db.shippingPrice) - Number(db.amountPaid);
    expect(remaining).toBe(17499.45); // a float bug here would produce 17499.449999999997 or similar

    await cleanupTenant(tenant.company.id);
  });

  test("zero balance: a freshly created shipment with no payment recorded owes its full price", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: loadBranch.id, unloadBranchId: unloadBranch.id, cartonCount: 2,
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shippingPrice: 8000 } });

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(Number(db.amountPaid)).toBe(0); // default, nothing paid yet
    expect(Number(db.shippingPrice) - Number(db.amountPaid)).toBe(8000);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expect(page.locator("text=8,000 ر.ي").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("platform fee stays exactly cartons x 5 YER across many shipments, no float drift on aggregation", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    // Carton counts chosen so the running total repeatedly crosses values that classic float
    // summation (0.1 + 0.2 style drift) tends to corrupt when done many times in a row.
    const cartonCounts = [1, 3, 7, 11, 2, 9, 5, 13, 1, 6];
    for (const n of cartonCounts) {
      const s = await createTestShipment({
        companyId: tenant.company.id, customerId: tenant.customerId,
        loadBranchId: loadBranch.id, unloadBranchId: unloadBranch.id, cartonCount: n,
      });
      const entry = await prisma.billingLedgerEntry.findFirstOrThrow({ where: { shipmentId: s.id } });
      expect(Number(entry.amount)).toBe(n * 5);
    }

    const totalCartons = cartonCounts.reduce((a, b) => a + b, 0);
    const entries = await prisma.billingLedgerEntry.findMany({ where: { companyId: tenant.company.id } });
    const total = entries.reduce((sum, e) => sum + Number(e.amount), 0);
    expect(total).toBe(totalCartons * 5);

    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator(`text=${totalCartons * 5}`).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
