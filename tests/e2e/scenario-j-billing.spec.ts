import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, login, cleanupTenant } from "./helpers";
import { chargeCartonFee } from "../../src/modules/billing/service";

test.describe("Scenario J — billing is per physical carton and append-only", () => {
  test("creating a shipment charges exactly cartonCount x 5 YER, once", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [loadBranch, unloadBranch] = tenant.branches;

    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");
    await page.click('button:has-text("شحنة جديدة")');
    await page.fill('input[name="customerName"]', "عميل الفوترة");
    await page.fill('input[name="customerPhone"]', "+967711223344");
    const comboboxes = page.locator('[role="dialog"] button[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.locator(`[role="option"]:has-text("${loadBranch.name}")`).click();
    await comboboxes.nth(1).click();
    await page.locator(`[role="option"]:has-text("${unloadBranch.name}")`).click();
    await page.fill('input[name="cartonCount"]', "6");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await page.waitForURL(/\/app\/shipments\//);

    const shipmentId = page.url().split("/shipments/")[1];
    const entries = await prisma.billingLedgerEntry.findMany({ where: { shipmentId } });
    expect(entries.length).toBe(1);
    expect(entries[0].cartonCount).toBe(6);
    expect(Number(entries[0].feePerCarton)).toBe(5);
    expect(Number(entries[0].amount)).toBe(30);

    // Idempotency guard: charging the same shipment again (e.g. a retried request) must not double-bill
    await Promise.all([chargeCartonFee(shipmentId), chargeCartonFee(shipmentId)]);

    const entriesAfter = await prisma.billingLedgerEntry.findMany({ where: { shipmentId } });
    expect(entriesAfter.length).toBe(1);
    expect(entriesAfter[0].id).toBe(entries[0].id); // same row, never mutated into a second one

    await cleanupTenant(tenant.company.id);
  });
});
