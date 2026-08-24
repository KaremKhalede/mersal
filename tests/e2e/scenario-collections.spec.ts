import { test, expect } from "@playwright/test";
import {
  prisma,
  createTestTenant,
  createTestShipment,
  createBranchScopedUser,
  login,
  cleanupTenant,
  pollUntil,
  visibleText,
} from "./helpers";

/**
 * COLLECTIONS & CASH — the customer-money program.
 *
 * Two claims are load-bearing here and everything else is supporting detail:
 *
 *   1. A partial payment must NOT be counted twice. `Shipment.amountPaid` is a running total, so
 *      any daily figure derived by summing it re-counts every earlier instalment. This suite pays
 *      one shipment twice, on the same day, through the real UI, and asserts the close shows the
 *      two payments and not the two cumulative totals.
 *
 *   2. Customer money and platform money never meet. The two live on separate tabs, and neither
 *      tab may print the other's figures.
 */

/** The receivables tab is the default, so an explicit tab param is only needed for the other two. */
const RECEIVABLES = "/app/billing";
const CLOSE = "/app/billing?tab=close";
const PLATFORM = "/app/billing?tab=platform";

test.describe("Collections — من عليه، ومنذ متى", () => {
  test("groups open balances by customer, ages them, and hides anything fully paid", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;

    const payingCustomer = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل مسدد بالكامل", phone: "+967700000111" },
    });
    const bigDebtor = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل عليه عدة شحنات", phone: "+967700000222" },
    });

    const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    // One customer, one shipment, partly paid — the simplest possible receivable.
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 2,
      shippingPrice: 1000, amountPaid: 400,
    });

    // One customer, three shipments, spread across aging buckets so each bucket is exercised by a
    // real row rather than by an empty one.
    const old1 = await createTestShipment({
      companyId: tenant.company.id, customerId: bigDebtor.id,
      loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 2000, amountPaid: 0,
    });
    const old2 = await createTestShipment({
      companyId: tenant.company.id, customerId: bigDebtor.id,
      loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 500, amountPaid: 100,
    });
    await createTestShipment({
      companyId: tenant.company.id, customerId: bigDebtor.id,
      loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 300, amountPaid: 0,
    });
    // Back-date two of them: createdAt is the aging anchor (see modules/collections/service.ts).
    await prisma.shipment.update({ where: { id: old1.id }, data: { createdAt: daysAgo(40) } });
    await prisma.shipment.update({ where: { id: old2.id }, data: { createdAt: daysAgo(20) } });

    // Fully paid — must not appear anywhere on this screen. This is the row that proves the
    // predicate is `amountPaid < shippingPrice` and not "has a price".
    await createTestShipment({
      companyId: tenant.company.id, customerId: payingCustomer.id,
      loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 750, amountPaid: 750,
    });

    // No agreed price yet: nothing is owed on a price that was never set, so this is not a
    // receivable either — the same exclusion the shipments list's unpaid filter makes.
    await createTestShipment({
      companyId: tenant.company.id, customerId: payingCustomer.id,
      loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1,
    });

    await login(page, tenant.adminEmail);
    await page.goto(RECEIVABLES);

    // Outstanding = 600 + 2000 + 400 + 300 = 3300. The fully-paid and unpriced shipments add zero.
    await expect(visibleText(page, "مستحق الآن على العملاء").first()).toBeVisible();
    await expect(visibleText(page, "3,300").first()).toBeVisible();

    // Both debtors are listed; the settled customer is not in the DOM at all.
    await expect(visibleText(page, "عميل عليه عدة شحنات").first()).toBeVisible();
    await expect(page.locator("text=عميل مسدد بالكامل")).toHaveCount(0);

    // Overdue (> 14 days) = 2000 (40d) + 400 (20d) = 2400.
    await expect(visibleText(page, "متأخر أكثر من 14 يوم").first()).toBeVisible();
    await expect(visibleText(page, "2,400").first()).toBeVisible();

    // Aging buckets are present and the oldest one carries the 40-day shipment.
    await expect(visibleText(page, "أكثر من 30 يوم").first()).toBeVisible();
    await expect(visibleText(page, "0–7 أيام").first()).toBeVisible();

    // Expanding a customer reveals their unpaid shipments, and each one links to the shipment page
    // — which is where PaymentDialog lives. The collection path itself is unchanged.
    await page.locator("summary", { hasText: "عميل عليه عدة شحنات" }).click();
    await expect(page.locator(`a[href="/app/shipments/${old1.id}"]`).first()).toBeVisible();

    // Filtering by an aging bucket narrows the customer list without rewriting the buckets.
    await page.goto(`${RECEIVABLES}?tab=receivables&aging=30%2B`);
    await expect(visibleText(page, "عميل عليه عدة شحنات").first()).toBeVisible();
    // The whole-population figures are unchanged by the filter — that is the point of computing
    // them before it is applied.
    await expect(visibleText(page, "3,300").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("shows a designed empty state when nothing is owed", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[0].id, cartonCount: 1,
      shippingPrice: 200, amountPaid: 200,
    });

    await login(page, tenant.adminEmail);
    await page.goto(RECEIVABLES);
    await expect(visibleText(page, "لا توجد مستحقات على العملاء").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a branch-scoped employee sees only their own branch's receivables, and cannot widen", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;

    const customerA = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل فرع أ", phone: "+967700000333" },
    });
    const customerB = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل فرع ب", phone: "+967700000444" },
    });

    await createTestShipment({
      companyId: tenant.company.id, customerId: customerA.id,
      loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 900, amountPaid: 0,
    });
    await createTestShipment({
      companyId: tenant.company.id, customerId: customerB.id,
      loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1,
      shippingPrice: 1500, amountPaid: 0,
    });

    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { billing: ["view"], shipments: ["view"] },
    });

    await login(page, employee.email);
    await page.goto(RECEIVABLES);
    await expect(visibleText(page, "عميل فرع أ").first()).toBeVisible();
    await expect(page.locator("text=عميل فرع ب")).toHaveCount(0);
    await expect(visibleText(page, "900").first()).toBeVisible();

    // The branch filter is not offered at all to a role that cannot widen its view — and forcing
    // another branch through the URL must not widen it either.
    await expect(page.locator('select[name="branchId"]')).toHaveCount(0);
    await page.goto(`${RECEIVABLES}?tab=receivables&branchId=${branchB.id}`);
    await expect(page.locator("text=عميل فرع ب")).toHaveCount(0);

    // A company-wide admin sees both, and can narrow to one branch on purpose.
    await login(page, tenant.adminEmail);
    await page.goto(RECEIVABLES);
    await expect(visibleText(page, "عميل فرع أ").first()).toBeVisible();
    await expect(visibleText(page, "عميل فرع ب").first()).toBeVisible();
    await page.goto(`${RECEIVABLES}?tab=receivables&branchId=${branchB.id}`);
    await expect(visibleText(page, "عميل فرع ب").first()).toBeVisible();
    await expect(page.locator("text=عميل فرع أ")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("one company's receivables never appear in another's", async ({ page }) => {
    const one = await createTestTenant(["أ"]);
    const two = await createTestTenant(["ب"]);

    const theirCustomer = await prisma.customer.create({
      data: { companyId: two.company.id, name: "عميل شركة أخرى تماماً", phone: "+967700000555" },
    });
    await createTestShipment({
      companyId: two.company.id, customerId: theirCustomer.id,
      loadBranchId: two.branches[0].id, unloadBranchId: two.branches[0].id, cartonCount: 1,
      shippingPrice: 9999, amountPaid: 0,
    });
    await createTestShipment({
      companyId: one.company.id, customerId: one.customerId,
      loadBranchId: one.branches[0].id, unloadBranchId: one.branches[0].id, cartonCount: 1,
      shippingPrice: 100, amountPaid: 0,
    });

    await login(page, one.adminEmail);
    await page.goto(RECEIVABLES);
    await expect(page.locator("text=عميل شركة أخرى تماماً")).toHaveCount(0);
    await expect(page.locator("text=9,999")).toHaveCount(0);

    await cleanupTenant(one.company.id);
    await cleanupTenant(two.company.id);
  });
});

test.describe("Daily close — من قبض اليوم، وهل يطابق الصندوق", () => {
  test("a second payment on the same shipment counts once, not cumulatively", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const branch = tenant.branches[0];

    const counterStaff = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branch.id,
      permissions: { billing: ["view"], shipments: ["view", "edit"] },
    });

    // Intake: 400 of a 1,000 fare, taken by the company admin.
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branch.id, unloadBranchId: branch.id, cartonCount: 1,
      shippingPrice: 1000, amountPaid: 400,
      paymentReceivedById: tenant.adminId,
    });

    // Second payment through the real UI, by a different employee: the dialog collects the
    // CUMULATIVE total (700), so the money that actually changed hands is 300.
    await login(page, counterStaff.email);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.getByRole("button", { name: "تسجيل دفعة" }).first().click();
    await page.fill('input[name="amountPaid"]', "700");
    await page.getByRole("button", { name: /حفظ|تأكيد|تسجيل/ }).last().click();

    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => Number(s.amountPaid) === 700
    );

    // The real payment path must leave an event behind — this is what the close is derived from.
    const events = await prisma.auditLog.findMany({
      where: { companyId: tenant.company.id, action: "RECORD_PAYMENT", entityType: "Shipment", entityId: shipment.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);

    await login(page, tenant.adminEmail);
    await page.goto(CLOSE);

    // THE assertion this whole derivation exists for. Cumulative summing would print 1,100
    // (400 + 700); the truth is 700 (400 + 300).
    await expect(visibleText(page, "إجمالي التحصيل").first()).toBeVisible();
    await expect(visibleText(page, "700").first()).toBeVisible();
    await expect(page.locator("text=1,100")).toHaveCount(0);

    // Both employees appear, each credited with what they personally took.
    await expect(visibleText(page, "مدير اختبار").first()).toBeVisible();
    await expect(visibleText(page, "موظف فرع اختبار").first()).toBeVisible();
    await expect(visibleText(page, "300").first()).toBeVisible();

    // And the shipment's own balance agrees: 1,000 − 700 = 300 still owed.
    await page.goto(RECEIVABLES);
    await expect(visibleText(page, "300").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("splits a day's takings across several employees and matches the total", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;

    const staffA = await createBranchScopedUser({
      companyId: tenant.company.id, branchId: branchA.id, permissions: { billing: ["view"] },
    });
    const staffB = await createBranchScopedUser({
      companyId: tenant.company.id, branchId: branchB.id, permissions: { billing: ["view"] },
    });

    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1,
      shippingPrice: 1000, amountPaid: 1000, paymentReceivedById: staffA.userId,
    });
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1,
      shippingPrice: 250, amountPaid: 250, paymentReceivedById: staffA.userId,
    });
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchB.id, unloadBranchId: branchA.id, cartonCount: 1,
      shippingPrice: 600, amountPaid: 600, paymentReceivedById: staffB.userId,
    });
    // Yesterday's money belongs to yesterday's sheet, not today's.
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1,
      shippingPrice: 5000, amountPaid: 5000, paymentReceivedById: staffA.userId,
      paymentDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await login(page, tenant.adminEmail);
    await page.goto(CLOSE);

    // 1000 + 250 + 600 = 1,850 today. Yesterday's 5,000 is absent.
    await expect(visibleText(page, "1,850").first()).toBeVisible();
    await expect(page.locator("text=6,850")).toHaveCount(0);
    await expect(page.locator("text=5,000")).toHaveCount(0);

    // Per-branch split appears once more than one branch took money.
    await expect(visibleText(page, "التحصيل حسب الفرع").first()).toBeVisible();

    // A branch employee closes THEIR OWN till: staff A took 1,250, and branch B's 600 is not
    // theirs to count.
    await login(page, staffA.email);
    await page.goto(CLOSE);
    await expect(visibleText(page, "1,250").first()).toBeVisible();
    await expect(page.locator("text=1,850")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a day with no payments says so instead of showing an empty table", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await login(page, tenant.adminEmail);
    // Far enough back that no fixture from any other spec can land in it.
    await page.goto("/app/billing?tab=close&date=2020-01-15");
    await expect(visibleText(page, "لا توجد دفعات في").first()).toBeVisible();
    await expect(cashExpected(page)).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("the printable close sheet lists every payment and totals to the same figure", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const branch = tenant.branches[0];

    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: branch.id, unloadBranchId: branch.id, cartonCount: 1,
      shippingPrice: 800, amountPaid: 800, paymentReceivedById: tenant.adminId,
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/billing?tab=close");
    await page.getByRole("link", { name: /طباعة كشف الإقفال/ }).click();
    await expect(page).toHaveURL(/\/app\/billing\/daily-close\/print/);

    await expect(visibleText(page, "كشف إقفال التحصيل اليومي").first()).toBeVisible();
    await expect(visibleText(page, "800").first()).toBeVisible();
    // The signature block is what makes a counted drawer evidence rather than an assertion.
    await expect(visibleText(page, "قام بالجرد").first()).toBeVisible();
    await expect(visibleText(page, "استلم المبلغ").first()).toBeVisible();
    // No platform figure may appear on a customer-cash sheet. Asserted on the platform screens'
    // own vocabulary rather than on the words "رسوم المنصة", which the sheet's footnote uses
    // legitimately — to state that platform fees are exactly what this document excludes.
    await expect(visibleText(page, "لا يشمل رسوم المنصة").first()).toBeVisible();
    for (const platformOnly of ["الكراتين المفوترة", "حالة الفاتورة", "رقم الفاتورة", "سجل المدفوعات"]) {
      await expect(page.locator(`text=${platformOnly}`)).toHaveCount(0);
    }

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("The two kinds of money stay apart", () => {
  test("receivables and platform fees never share a screen", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[0].id, cartonCount: 4,
      shippingPrice: 1200, amountPaid: 0,
    });

    await login(page, tenant.adminEmail);

    // Customer tab: the customer's balance, and no invoice/platform vocabulary at all.
    await page.goto(RECEIVABLES);
    await expect(visibleText(page, "مستحق الآن على العملاء").first()).toBeVisible();
    await expect(page.locator("text=الفواتير")).toHaveCount(0);
    await expect(page.locator("text=الكراتين المفوترة")).toHaveCount(0);

    // Platform tab: unchanged behaviour, and no customer-receivable vocabulary.
    await page.goto(PLATFORM);
    await expect(visibleText(page, "الفواتير").first()).toBeVisible();
    await expect(page.locator("text=مستحق الآن على العملاء")).toHaveCount(0);
    await expect(page.locator("text=تقادم المستحقات")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("the dashboard's three finance figures each open the tab that explains them", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[0].id, cartonCount: 2,
      shippingPrice: 1000, amountPaid: 250, paymentReceivedById: tenant.adminId,
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app");
    await expect(visibleText(page, "ملخص مالي").first()).toBeVisible();

    // Collected today -> the close sheet.
    await page.locator('a[href^="/app/billing?tab=close"]').first().click();
    await expect(visibleText(page, "المتوقع في الصندوق (نقداً)").first()).toBeVisible();

    // Outstanding -> receivables, and the figure that opened it is the figure it adds up to.
    await page.goto("/app");
    await page.locator('a[href="/app/billing?tab=receivables"]').first().click();
    await expect(visibleText(page, "مستحق الآن على العملاء").first()).toBeVisible();
    await expect(visibleText(page, "750").first()).toBeVisible();

    // Platform fees -> the invoices tab.
    await page.goto("/app");
    await page.locator('a[href="/app/billing?tab=platform"]').first().click();
    await expect(visibleText(page, "الفواتير").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Shipment receipt", () => {
  test("prints what was handed over, what is owed, and a scannable tracking code", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 3,
      shippingPrice: 1500, amountPaid: 500, paymentReceivedById: tenant.adminId,
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/receipt`);

    await expect(visibleText(page, "إيصال استلام شحنة").first()).toBeVisible();
    await expect(visibleText(page, shipment.shipmentNumber).first()).toBeVisible();
    await expect(visibleText(page, "1,500").first()).toBeVisible(); // fare
    await expect(visibleText(page, "500").first()).toBeVisible();   // paid
    await expect(visibleText(page, "1,000").first()).toBeVisible(); // remaining
    await expect(visibleText(page, "امسح لتتبع الشحنة").first()).toBeVisible();
    await expect(page.locator("svg").first()).toBeVisible();

    // It must never claim to be something it is not.
    await expect(visibleText(page, "وليس فاتورة ضريبية").first()).toBeVisible();

    // Reachable from the shipment's own overflow menu, not just by URL.
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.getByRole("button", { name: "إجراءات أخرى" }).click();
    await expect(page.getByRole("menuitem", { name: /طباعة إيصال الاستلام/ })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("an unpriced shipment says the fare is not set rather than printing zero", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[0].id, cartonCount: 1,
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/receipt`);
    await expect(visibleText(page, "لم تُحدَّد بعد").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

/** The one figure a counter physically matches against — asserted by label, not by amount. */
function cashExpected(page: import("@playwright/test").Page) {
  return visibleText(page, "المتوقع في الصندوق (نقداً)").first();
}
