import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestPlatformAdmin, login, cleanupTenant } from "./helpers";
import { generateInvoice, recordSettlement, billingSummary, listInvoices } from "../../src/modules/billing/service";

/** Phase 5 P1 batch 2, item 3 — settlement / invoice paid. */
test.describe("Scenario X — settlement records and invoice paid state", () => {
  async function setupInvoice(cartonCount = 10) {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount });
    const periodStart = new Date(0);
    const periodEnd = new Date(Date.now() + 60_000);
    const invoice = await generateInvoice(tenant.company.id, periodStart, periodEnd);
    if (!invoice) throw new Error("test setup: expected an invoice to be generated");
    return { tenant, shipment, invoice };
  }

  test("partial settlement leaves the invoice UNPAID with correct settled/remaining", async () => {
    const { tenant, invoice } = await setupInvoice(10); // total = 50 YER
    expect(invoice.totalAmount).toBe(50);

    await recordSettlement(tenant.company.id, invoice.id, 20);

    const [updated] = (await listInvoices(tenant.company.id)).filter((i) => i.id === invoice.id);
    expect(updated.status).toBe("UNPAID");
    expect(updated.settled).toBe(20);
    expect(updated.remaining).toBe(30);

    await cleanupTenant(tenant.company.id);
  });

  test("full settlement — in one shot — flips the invoice to PAID", async () => {
    const { tenant, invoice } = await setupInvoice(10); // total = 50 YER

    await recordSettlement(tenant.company.id, invoice.id, 50);

    const [updated] = (await listInvoices(tenant.company.id)).filter((i) => i.id === invoice.id);
    expect(updated.status).toBe("PAID");
    expect(updated.settled).toBe(50);
    expect(updated.remaining).toBe(0);

    await cleanupTenant(tenant.company.id);
  });

  test("full settlement — accumulated across multiple partial payments — flips the invoice to PAID at the exact boundary", async () => {
    const { tenant, invoice } = await setupInvoice(10); // total = 50 YER

    await recordSettlement(tenant.company.id, invoice.id, 20);
    let [updated] = (await listInvoices(tenant.company.id)).filter((i) => i.id === invoice.id);
    expect(updated.status).toBe("UNPAID"); // 20/50 — not yet

    await recordSettlement(tenant.company.id, invoice.id, 29);
    [updated] = (await listInvoices(tenant.company.id)).filter((i) => i.id === invoice.id);
    expect(updated.status).toBe("UNPAID"); // 49/50 — one short, still not paid
    expect(updated.remaining).toBe(1);

    await recordSettlement(tenant.company.id, invoice.id, 1);
    [updated] = (await listInvoices(tenant.company.id)).filter((i) => i.id === invoice.id);
    expect(updated.status).toBe("PAID"); // 50/50 — exactly covered
    expect(updated.remaining).toBe(0);
    expect(updated.settlements).toHaveLength(3);

    await cleanupTenant(tenant.company.id);
  });

  test("duplicate settlement prevention: a fully-PAID invoice rejects any further settlement", async () => {
    const { tenant, invoice } = await setupInvoice(4); // total = 20 YER
    await recordSettlement(tenant.company.id, invoice.id, 20);

    await expect(recordSettlement(tenant.company.id, invoice.id, 5)).rejects.toThrow(/مسددة بالكامل/);

    // The rejected attempt must not have created a new ledger row or changed anything.
    const settlementCount = await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } });
    expect(settlementCount).toBe(1);
    const [updated] = (await listInvoices(tenant.company.id)).filter((i) => i.id === invoice.id);
    expect(updated.settled).toBe(20);

    await cleanupTenant(tenant.company.id);
  });

  test("historical ledger integrity: CARTON_FEE entries are never mutated by recording a settlement", async () => {
    const { tenant, shipment, invoice } = await setupInvoice(6); // total = 30 YER
    const feeEntryBefore = await prisma.billingLedgerEntry.findFirstOrThrow({ where: { shipmentId: shipment.id, entryType: "CARTON_FEE" } });

    await recordSettlement(tenant.company.id, invoice.id, 30, "تحويل بنكي");

    const feeEntryAfter = await prisma.billingLedgerEntry.findUniqueOrThrow({ where: { id: feeEntryBefore.id } });
    expect(feeEntryAfter.amount.toString()).toBe(feeEntryBefore.amount.toString());
    expect(feeEntryAfter.feePerCarton.toString()).toBe(feeEntryBefore.feePerCarton.toString());
    expect(feeEntryAfter.cartonCount).toBe(feeEntryBefore.cartonCount);
    expect(feeEntryAfter.entryType).toBe("CARTON_FEE"); // never rewritten into a SETTLEMENT row

    // billingSummary() (CARTON_FEE only, by design) must stay exactly what was charged, unaffected
    // by the settlement that was just recorded — "distinguish invoice amount from payments made."
    const summary = await billingSummary(tenant.company.id);
    expect(summary.totalAmount).toBe(30);

    await cleanupTenant(tenant.company.id);
  });

  test("customer shipping money stays fully separate from platform-fee settlement", async () => {
    const { tenant, shipment, invoice } = await setupInvoice(4); // total = 20 YER platform fee
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shippingPrice: 5000, amountPaid: 2000 } });

    await recordSettlement(tenant.company.id, invoice.id, 20);

    // Settling the platform invoice must not touch the shipment's own customer-money fields.
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(Number(db.shippingPrice)).toBe(5000);
    expect(Number(db.amountPaid)).toBe(2000);

    await cleanupTenant(tenant.company.id);
  });

  test("company reports a payment: it stays PENDING and the invoice does NOT move until the platform confirms", async ({ page }) => {
    const { tenant, invoice } = await setupInvoice(10); // total = 50 YER
    const admin = await createTestPlatformAdmin();

    // --- Company side: report, do not settle -------------------------------------------------
    await login(page, tenant.adminEmail);
    await page.goto("/app/billing");
    await page.click('button:has-text("الإبلاغ عن دفعة")');
    await page.fill('input[name="amount"]', "50");
    await page.fill('input[name="reference"]', "TRX-9911");
    await page.click('[role="dialog"] button:has-text("إرسال للمراجعة")');

    await expect
      .poll(async () => prisma.paymentSubmission.count({ where: { invoiceId: invoice.id, status: "PENDING" } }))
      .toBe(1);

    // The invoice must be untouched, and no SETTLEMENT may exist yet — an unverified claim is not money.
    const stillUnpaid = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(stillUnpaid.status).toBe("UNPAID");
    expect(await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })).toBe(0);

    // --- Platform side: confirm ----------------------------------------------------------------
    await login(page, admin.email);
    await page.goto("/platform/billing");
    await expect(page.locator("text=دفعات بانتظار المراجعة")).toBeVisible();
    // Scope to this test's own row — the queue is shared, so clicking the first "تأكيد" would
    // confirm an unrelated tenant's payment.
    await page.locator("li", { hasText: invoice.invoiceNumber }).getByRole("button", { name: "تأكيد" }).click();

    await expect
      .poll(async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status)
      .toBe("PAID");
    // Confirming is what appends the real ledger row.
    expect(await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("the company can no longer settle or issue its own invoice from /app/billing", async ({ page }) => {
    const { tenant } = await setupInvoice(4);

    await login(page, tenant.adminEmail);
    await page.goto("/app/billing");

    await expect(page.locator('button:has-text("سداد الفاتورة")')).toHaveCount(0);
    await expect(page.locator('button:has-text("إصدار فاتورة")')).toHaveCount(0);
    await expect(page.locator('button:has-text("الإبلاغ عن دفعة")')).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
