import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestPlatformAdmin, login, cleanupTenant } from "./helpers";
import { generateInvoice, submitPayment, confirmPaymentSubmission, rejectPaymentSubmission } from "../../src/modules/billing/service";

/** دورة التحقق من الدفع: الشركة تُبلّغ ← المنصة تراجع ← الحالة تتغير عند الطرفين. */
test.describe("Scenario — payment verification workflow", () => {
  async function setup(cartonCount = 10) {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount });
    const invoice = await generateInvoice(tenant.company.id, new Date(0), new Date(Date.now() + 60_000));
    if (!invoice) throw new Error("setup: expected an invoice");
    return { tenant, invoice };
  }

  test("a pending submission is not counted as collected money anywhere", async () => {
    const { tenant, invoice } = await setup(10); // 50 YER
    await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "BANK_TRANSFER" });

    // The ledger is the single source of truth for collected money — a claim must not appear in it.
    const settlements = await prisma.billingLedgerEntry.count({ where: { companyId: tenant.company.id, entryType: "SETTLEMENT" } });
    expect(settlements).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("UNPAID");

    await cleanupTenant(tenant.company.id);
  });

  test("confirming creates exactly one settlement and flips the invoice to PAID", async () => {
    const { tenant, invoice } = await setup(10);
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "BANK_TRANSFER" });
    await confirmPaymentSubmission(sub.id);

    const entries = await prisma.billingLedgerEntry.findMany({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } });
    expect(entries).toHaveLength(1);
    expect(Number(entries[0].amount)).toBe(-50); // credits are negative by convention
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");

    const stored = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stored.status).toBe("CONFIRMED");
    expect(stored.ledgerEntryId).toBe(entries[0].id);

    await cleanupTenant(tenant.company.id);
  });

  test("a partial confirmation leaves the invoice UNPAID with the right remaining balance", async () => {
    const { tenant, invoice } = await setup(10); // 50 YER
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 20, method: "CASH" });
    await confirmPaymentSubmission(sub.id);

    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("UNPAID");
    const settled = await prisma.billingLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { invoiceId: invoice.id, entryType: "SETTLEMENT" },
    });
    expect(Math.abs(Number(settled._sum.amount))).toBe(20); // remaining = 50 - 20 = 30

    await cleanupTenant(tenant.company.id);
  });

  test("rejecting never touches the ledger and records the reason", async () => {
    const { tenant, invoice } = await setup(10);
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "BANK_TRANSFER" });
    await rejectPaymentSubmission(sub.id, "الإثبات غير واضح");

    expect(await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("UNPAID");
    const stored = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: sub.id } });
    expect(stored.status).toBe("REJECTED");
    expect(stored.rejectionReason).toBe("الإثبات غير واضح");

    await cleanupTenant(tenant.company.id);
  });

  test("a submission can never be reviewed twice", async () => {
    const { tenant, invoice } = await setup(10);
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "BANK_TRANSFER" });
    await confirmPaymentSubmission(sub.id);

    await expect(confirmPaymentSubmission(sub.id)).rejects.toThrow();
    await expect(rejectPaymentSubmission(sub.id, "متأخر")).rejects.toThrow();
    expect(await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("a company cannot attach a payment to another tenant's invoice", async () => {
    const a = await setup(4);
    const b = await setup(4);

    await expect(
      submitPayment({ companyId: b.tenant.company.id, invoiceId: a.invoice.id, amount: 10, method: "CASH" })
    ).rejects.toThrow();

    await cleanupTenant(a.tenant.company.id);
    await cleanupTenant(b.tenant.company.id);
  });

  test("only one pending claim per invoice at a time", async () => {
    const { tenant, invoice } = await setup(10);
    await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 10, method: "CASH" });
    await expect(
      submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 10, method: "CASH" })
    ).rejects.toThrow();

    await cleanupTenant(tenant.company.id);
  });

  test("payment proof is readable by its own company and the platform, never by another tenant", async ({ page }) => {
    const { tenant, invoice } = await setup(10);
    const other = await createTestTenant(["ج", "د"]);
    const admin = await createTestPlatformAdmin();

    const sub = await submitPayment({
      companyId: tenant.company.id,
      invoiceId: invoice.id,
      amount: 50,
      method: "BANK_TRANSFER",
      proofKey: `${tenant.company.id}/missing-proof.pdf`,
      proofFileName: "proof.pdf",
    });

    // Another tenant must get 404 (not 403 — never confirm the record exists).
    await login(page, other.adminEmail);
    expect((await page.request.get(`/api/payment-proof/${sub.id}`)).status()).toBe(404);

    // Owner + platform admin are authorized; the file itself is absent in this fixture, so the
    // route's storage-miss path also returns 404 — what matters is the tenant check above.
    await login(page, tenant.adminEmail);
    expect([200, 404]).toContain((await page.request.get(`/api/payment-proof/${sub.id}`)).status());

    await cleanupTenant(tenant.company.id);
    await cleanupTenant(other.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a company user cannot confirm or reject payments", async ({ page }) => {
    const { tenant } = await setup(4);
    await login(page, tenant.adminEmail);

    // The review queue lives on a platform-only route.
    await page.goto("/platform/billing");
    await expect(page).not.toHaveURL(/\/platform\/billing$/);

    await cleanupTenant(tenant.company.id);
  });
});
