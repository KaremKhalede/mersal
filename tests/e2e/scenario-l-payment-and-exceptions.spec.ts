import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant, pollUntil } from "./helpers";

test.describe("Scenario L — customer payment recording and exception resolution", () => {
  test("recording a payment updates amountPaid without touching the platform ledger", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 3,
      status: "RECEIVED",
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shippingPrice: 45000 } });

    const ledgerBefore = await prisma.billingLedgerEntry.findFirst({ where: { shipmentId: shipment.id } });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await page.click('button:has-text("تسجيل دفعة")');
    await page.fill('input[name="amountPaid"]', "45000");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    const dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => Number(s.amountPaid) === 45000
    );
    expect(Number(dbShipment.amountPaid)).toBe(45000);
    expect(Number(dbShipment.shippingPrice)).toBe(45000);

    // The platform's per-carton fee ledger must be completely unaffected by the customer payment.
    const ledgerAfter = await prisma.billingLedgerEntry.findFirst({ where: { shipmentId: shipment.id } });
    expect(Number(ledgerAfter?.amount)).toBe(Number(ledgerBefore?.amount));
    expect(Number(ledgerAfter?.amount)).toBe(15); // 3 cartons x 5 YER

    await expect(page.locator("text=45000 ر.ي").first()).toBeVisible();

    // Printable carton labels — one per physical carton, showing company/shipment/carton-index/destination/receiver.
    await page.goto(`/app/shipments/${shipment.id}/label`);
    await expect(page.locator(`text=${shipment.shipmentNumber}`).first()).toBeVisible();
    await expect(page.locator("text=كرتون 1 / 3")).toBeVisible();
    await expect(page.locator("text=كرتون 3 / 3")).toBeVisible();
    await expect(page.locator(`text=${loadBranch.name} ← ${unloadBranch.name}`).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("raising an exception blocks normal actions, and resolving it restores the prior status", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 2,
      status: "RECEIVED",
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await page.click('button:has-text("تسجيل استثناء")');
    await page.fill('textarea[name="note"]', "كرتون تالف أثناء الفحص");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    let dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "EXCEPTION"
    );
    expect(dbShipment.status).toBe("EXCEPTION");
    expect(dbShipment.statusBeforeException).toBe("RECEIVED");
    expect(dbShipment.exceptionNote).toBe("كرتون تالف أثناء الفحص");

    // Exceptions list shows the open case
    await page.goto("/app/exceptions");
    await expect(page.locator(`text=${shipment.shipmentNumber}`).first()).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.click('button:has-text("حل الاستثناء")');
    dbShipment = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "RECEIVED"
    );
    expect(dbShipment.status).toBe("RECEIVED");
    expect(dbShipment.statusBeforeException).toBeNull();
    expect(dbShipment.exceptionType).toBeNull();

    await cleanupTenant(tenant.company.id);
  });
});
