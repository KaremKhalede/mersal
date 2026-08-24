import { test, expect, type Page } from "@playwright/test";
import {
  createTestTenant, createBranchScopedUser, cleanupTenant, login, createTestShipment, prisma, expectNotFound,
} from "./helpers";
import { generateInvoice } from "../../src/modules/billing/service";

/**
 * The invoice has to survive being a document.
 *
 * "تحميل PDF" used to print /app/billing itself: the StatCards, the table of every other invoice,
 * the selection chevron — and, worst, line items capped at five of fourteen by
 * ShipmentBreakdownTable's client-side toggle, with no print override. A 45-carton / 225 ر.ي invoice
 * printed lines adding up to 90 ر.ي and a "عرض جميع الشحنات" button. It could not be reconciled.
 *
 * The load-bearing assertion below is therefore not about layout at all: it reads the money out of
 * the *rendered* table and requires the lines to sum to the stated total. Everything else here is
 * about what must not be on the page.
 */

/**
 * Money as printed: "المتبقي 1,234.50 ر.ي" -> 1234.5.
 *
 * Matches the first numeric token rather than stripping non-digits, because the currency symbol
 * "ر.ي" contains a literal dot — a strip-based parse yields "1234.50." and therefore NaN. That bug
 * hid itself: `expect(NaN).toBe(NaN)` passes under Object.is, so an assertion comparing two broken
 * reads looked green.
 */
function parseMoney(text: string): number {
  const m = text.match(/-?[\d,]+(?:\.\d+)?/);
  if (!m) throw new Error(`no number found in: ${JSON.stringify(text)}`);
  return Number(m[0].replace(/,/g, ""));
}

/** Reads the document's own line table and totals, exactly as a person would. */
async function readDocument(page: Page) {
  const rows = page.locator("tbody tr");
  const n = await rows.count();
  let linesSum = 0;
  let cartonSum = 0;
  for (let i = 0; i < n; i++) {
    const cells = rows.nth(i).locator("td");
    if ((await cells.count()) < 5) continue; // the "no lines" placeholder row
    cartonSum += Number((await cells.nth(2).innerText()).replace(/[^\d]/g, "") || 0);
    linesSum += parseMoney(await cells.nth(4).innerText());
  }
  // The footer's first cell spans the date+shipment columns, so it holds four <td> to the head's
  // five: [الإجمالي (colspan 2)] [cartons] [] [total].
  const footCells = page.locator("tfoot td");
  return {
    rowCount: n,
    linesSum: Math.round(linesSum * 100) / 100,
    cartonSum,
    footerCartons: Number((await footCells.nth(1).innerText()).replace(/[^\d]/g, "") || 0),
    footerTotal: parseMoney(await footCells.last().innerText()),
    invoiceTotal: parseMoney(await page.locator("text=إجمالي الفاتورة").locator("xpath=..").innerText()),
    remaining: parseMoney(await page.locator("text=المتبقي").locator("xpath=..").innerText()),
  };
}

async function seedInvoice(companyId: string, customerId: string, a: string, b: string, cartonCounts: number[]) {
  for (const c of cartonCounts) {
    await createTestShipment({
      companyId, customerId, loadBranchId: a, unloadBranchId: b, cartonCount: c, status: "DELIVERED",
    });
  }
  const inv = await generateInvoice(companyId, new Date(Date.now() - 30 * 864e5), new Date(Date.now() + 864e5));
  if (!inv) throw new Error("no invoice generated");
  return inv;
}

test.describe("invoice print document", () => {
  test("every line is printed and the lines sum to the invoice total", async ({ page }) => {
    const tenant = await createTestTenant();
    const [a, b] = tenant.branches;
    // 14 shipments — comfortably past the old five-row cap that made the document unreconcilable.
    const counts = [1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6, 2, 1];
    const inv = await seedInvoice(tenant.company.id, tenant.customerId, a.id, b.id, counts);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/billing/${inv.id}/print`);
    await page.locator("h1").waitFor();

    const doc = await readDocument(page);

    // THE assertion this route exists for.
    expect(doc.rowCount, "every ledger line must be printed").toBe(counts.length);
    expect(doc.linesSum, "printed lines must sum to the stated total").toBe(doc.invoiceTotal);
    expect(doc.footerTotal).toBe(doc.invoiceTotal);
    expect(doc.cartonSum).toBe(counts.reduce((s, c) => s + c, 0));
    expect(doc.footerCartons).toBe(doc.cartonSum);
    // and it agrees with what the database stores
    expect(doc.invoiceTotal).toBe(inv.totalAmount);

    // No truncation control survived onto the document.
    await expect(page.locator("text=عرض جميع الشحنات")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("it reads as an invoice, not as the billing page", async ({ page }) => {
    const tenant = await createTestTenant();
    const [a, b] = tenant.branches;
    await prisma.company.update({
      where: { id: tenant.company.id },
      data: { address: "شارع الستين، صنعاء", phone: "+967771234567", email: "acc@test.local" },
    });
    const inv = await seedInvoice(tenant.company.id, tenant.customerId, a.id, b.id, [3, 4]);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/billing/${inv.id}/print`);

    // present: identity, both parties, terms
    await expect(page.getByRole("heading", { name: "فاتورة رسوم المنصة" })).toBeVisible();
    await expect(page.locator(`text=${inv.invoiceNumber}`).first()).toBeVisible();
    await expect(page.locator("text=تاريخ الإصدار")).toBeVisible();
    await expect(page.locator("text=مُصدَرة إلى")).toBeVisible();
    await expect(page.locator(`text=${tenant.company.name}`).first()).toBeVisible();
    await expect(page.locator("text=شارع الستين، صنعاء")).toBeVisible();
    await expect(page.locator("text=رسوم مناولة الكراتين")).toBeVisible();
    await expect(page.locator("text=ليست فاتورة ضريبية")).toBeVisible();

    // absent: the dashboard that used to come along for the ride
    for (const noise of ["الكراتين المفوترة", "سجل المدفوعات", "تفاصيل الكراتين حسب الشحنات", "رسوم المنصة (غير مفوترة بعد)"]) {
      await expect(page.locator(`text=${noise}`), `"${noise}" must not be on the document`).toHaveCount(0);
    }
    // No app chrome *on paper*. The route lives under /app so the shell is in the DOM — that is
    // deliberate, it is how the user gets back — but the sidebar, topbar and the route's own back
    // link and print button all carry `print:hidden`, so none of them reaches the document.
    // Asserted under print media and by measured size, since a print:hidden ancestor still leaves
    // its descendants with their own computed display.
    await page.emulateMedia({ media: "print" });
    for (const [name, sel] of [["sidebar", "aside"], ["topbar", "header.border-b"], ["back link", "text=رجوع إلى المالية"], ["print button", "text=طباعة الفاتورة"]] as const) {
      const box = await page.locator(sel).first().boundingBox().catch(() => null);
      expect(box, `${name} must not be in the printed document`).toBeNull();
    }
    // the document itself is still there
    expect(await page.getByRole("heading", { name: "فاتورة رسوم المنصة" }).boundingBox()).not.toBeNull();
    await page.emulateMedia({ media: null });

    await cleanupTenant(tenant.company.id);
  });

  test("paid and unpaid states are stated, and the balance follows the payments", async ({ page }) => {
    const tenant = await createTestTenant();
    const [a, b] = tenant.branches;
    const inv = await seedInvoice(tenant.company.id, tenant.customerId, a.id, b.id, [2, 2]);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/billing/${inv.id}/print`);
    await expect(page.locator("text=غير مدفوعة")).toBeVisible();
    let doc = await readDocument(page);
    expect(doc.remaining).toBe(doc.invoiceTotal);

    // settle it exactly the way the product does — an immutable negative ledger row
    const { recordSettlement } = await import("../../src/modules/billing/service");
    await recordSettlement(tenant.company.id, inv.id, inv.totalAmount, "اختبار");

    await page.reload();
    await expect(page.locator("text=مدفوعة").first()).toBeVisible();
    doc = await readDocument(page);
    expect(doc.remaining, "a settled invoice owes nothing").toBe(0);
    // settlements are payments, not charges — they must never appear as line items
    expect(doc.linesSum).toBe(doc.invoiceTotal);
    expect(doc.rowCount).toBe(2);

    await cleanupTenant(tenant.company.id);
  });

  test("another company's invoice is not reachable by id", async ({ page }) => {
    const victim = await createTestTenant();
    const attacker = await createTestTenant();
    const [a, b] = victim.branches;
    const inv = await seedInvoice(victim.company.id, victim.customerId, a.id, b.id, [5]);

    await login(page, attacker.adminEmail);
    await page.goto(`/app/billing/${inv.id}/print`);
    await expectNotFound(page, [inv.invoiceNumber, victim.company.name]);

    await cleanupTenant(victim.company.id);
    await cleanupTenant(attacker.company.id);
  });

  test("a role without billing.view cannot open the document", async ({ page }) => {
    const tenant = await createTestTenant();
    const [a, b] = tenant.branches;
    const inv = await seedInvoice(tenant.company.id, tenant.customerId, a.id, b.id, [3]);
    const noBilling = await createBranchScopedUser({
      companyId: tenant.company.id, branchId: a.id,
      permissions: { shipments: ["view"] }, roleName: "بلا مالية",
    });

    await login(page, noBilling.email);
    await page.goto(`/app/billing/${inv.id}/print`);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(inv.invoiceNumber);
    expect(body).not.toContain("فاتورة رسوم المنصة");

    await cleanupTenant(tenant.company.id);
  });
});
