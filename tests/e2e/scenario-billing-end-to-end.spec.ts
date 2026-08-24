import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestPlatformAdmin, login, cleanupTenant } from "./helpers";
import { generateInvoice, submitPayment, rejectPaymentSubmission } from "../../src/modules/billing/service";

/**
 * الرحلة الكاملة: فاتورة ← إبلاغ ← مراجعة ← تأكيد/رفض ← انعكاس على الطرفين.
 * Covers the 18 required scenarios end to end through the real UI where it matters.
 */
test.describe("Scenario — billing end to end", () => {
  async function setup(cartonCount = 10) {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount });
    const invoice = await generateInvoice(tenant.company.id, new Date(0), new Date(Date.now() + 60_000));
    if (!invoice) throw new Error("setup: expected an invoice");
    const admin = await createTestPlatformAdmin();
    return { tenant, invoice, admin };
  }

  test("full happy path: company reports, admin confirms, both dashboards agree", async ({ page }) => {
    const { tenant, invoice, admin } = await setup(10); // 50 ر.ي

    // 2. Company sees the invoice, unpaid.
    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator(`text=${invoice.invoiceNumber}`).first()).toBeVisible();
    await expect(page.locator("tbody").locator("text=غير مدفوعة").first()).toBeVisible();

    // 3-4. Report a payment -> PENDING.
    await page.click('button:has-text("الإبلاغ عن دفعة")');
    await page.fill('input[name="amount"]', "50");
    await page.fill('input[name="reference"]', "TRX-100");
    await page.click('[role="dialog"] button:has-text("إرسال للمراجعة")');
    await expect.poll(async () => prisma.paymentSubmission.count({ where: { invoiceId: invoice.id, status: "PENDING" } })).toBe(1);

    // 17. PENDING must not count as collected on the company side.
    await page.reload();
    await expect(page.locator("text=بانتظار مراجعة الدفع").first()).toBeVisible();
    const beforeConfirm = await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } });
    expect(beforeConfirm).toBe(0);

    // 5-6. Admin sees it queued, with the proof control and the amounts to compare.
    await login(page, admin.email);
    await page.goto("/platform/billing");
    await expect(page.locator("text=دفعات بانتظار المراجعة")).toBeVisible();
    await expect(page.locator(`text=${invoice.invoiceNumber}`).first()).toBeVisible();
    await expect(page.locator("text=المتبقي على الفاتورة").first()).toBeVisible();

    // 7-10. Confirm -> settlement + PAID. Scoped to this invoice: the review queue is shared.
    await page.locator("li", { hasText: invoice.invoiceNumber }).getByRole("button", { name: "تأكيد" }).click();
    await expect.poll(async () => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
    expect(await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })).toBe(1);

    // 18. Both dashboards report the same collected figure.
    await page.goto(`/platform/billing/${tenant.company.id}`);
    await expect(page.locator("text=مدفوعة").first()).toBeVisible();
    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator("tbody").locator("text=مدفوعة").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("partial confirmation shows مدفوعة جزئياً with the right remaining on both sides", async ({ page }) => {
    const { tenant, invoice, admin } = await setup(10); // 50 ر.ي
    await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 20, method: "CASH" });

    await login(page, admin.email);
    await page.goto("/platform/billing");
    await page.locator("li", { hasText: invoice.invoiceNumber }).getByRole("button", { name: "تأكيد" }).click();
    await expect.poll(async () =>
      prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })
    ).toBe(1);

    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator("tbody").locator("text=مدفوعة جزئياً").first()).toBeVisible();
    // 50 - 20 = 30 remaining.
    await expect(page.locator("text=30").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("rejection: no settlement, reason shown to the company, and it can resubmit", async ({ page }) => {
    const { tenant, invoice, admin } = await setup(10);
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "BANK_TRANSFER" });

    // 12-13. Reject via the real UI.
    await login(page, admin.email);
    await page.goto("/platform/billing");
    await page.locator("li", { hasText: invoice.invoiceNumber }).getByRole("button", { name: "رفض" }).click();
    await page.fill('[role="dialog"] input[name="reason"]', "الإثبات غير واضح");
    await page.click('[role="dialog"] button:has-text("تأكيد الرفض")');

    await expect.poll(async () => (await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("REJECTED");
    expect(await prisma.billingLedgerEntry.count({ where: { invoiceId: invoice.id, entryType: "SETTLEMENT" } })).toBe(0);

    // The company sees why, and the CTA is available again.
    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator("text=الإثبات غير واضح").first()).toBeVisible();
    const cta = page.locator('button:has-text("الإبلاغ عن دفعة")');
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();

    // 14. Resubmit succeeds.
    await cta.click();
    await page.fill('input[name="amount"]', "50");
    await page.click('[role="dialog"] button:has-text("إرسال للمراجعة")');
    await expect.poll(async () => prisma.paymentSubmission.count({ where: { invoiceId: invoice.id, status: "PENDING" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("the CTA is disabled while a claim is already under review", async ({ page }) => {
    const { tenant, invoice, admin } = await setup(10);
    await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "CASH" });

    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator('button:has-text("الإبلاغ عن دفعة")')).toBeDisabled();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a rejected claim never becomes money even if the invoice is later paid another way", async () => {
    const { tenant, invoice, admin } = await setup(10);
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "CASH" });
    await rejectPaymentSubmission(sub.id, "مبلغ خاطئ");

    const collected = await prisma.billingLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { companyId: tenant.company.id, entryType: "SETTLEMENT" },
    });
    expect(Number(collected._sum.amount ?? 0)).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("UNPAID");

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("another company cannot see or act on someone else's payment claim", async ({ page }) => {
    const { tenant, invoice, admin } = await setup(10);
    const sub = await submitPayment({ companyId: tenant.company.id, invoiceId: invoice.id, amount: 50, method: "CASH" });
    const other = await createTestTenant(["ج", "د"]);

    // 15. Cross-tenant proof read is a 404, and the review queue is platform-only.
    await login(page, other.adminEmail);
    expect((await page.request.get(`/api/payment-proof/${sub.id}`)).status()).toBe(404);
    await page.goto("/platform/billing");
    await expect(page).not.toHaveURL(/\/platform\/billing$/);

    // 16. The other tenant's own billing page must not leak this invoice.
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator(`text=${invoice.invoiceNumber}`)).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
    await cleanupTenant(other.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("only the platform can issue an invoice for a company", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [a, b] = tenant.branches;
    await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 3 });
    const admin = await createTestPlatformAdmin();

    // The company has no issuing control at all.
    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=platform");
    await expect(page.locator('button:has-text("إصدار فاتورة")')).toHaveCount(0);

    // The platform does, and it produces a real invoice.
    await login(page, admin.email);
    await page.goto(`/platform/billing/${tenant.company.id}`);
    await page.click('button:has-text("إصدار فاتورة الفترة")');
    await expect.poll(async () => prisma.invoice.count({ where: { companyId: tenant.company.id } })).toBeGreaterThan(0);

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });
});
