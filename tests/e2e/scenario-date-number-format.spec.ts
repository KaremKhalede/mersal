import { test, expect } from "@playwright/test";
import { createTestTenant, cleanupTenant, login, createTestShipment, prisma } from "./helpers";
import { formatDate, formatDateStamp } from "../../src/lib/timezone";
import { formatPhoneDisplay } from "../../src/lib/phone";

/**
 * Dates and numbers have to be *right*, not merely present.
 *
 * Arabic numeric dates come out of Intl carrying U+200F around each separator — "21‏/8‏/2026".
 * Those marks are strong-RTL, so they split the number into three runs which the RTL paragraph then
 * lays out right-to-left: the string displays as 2026/8/21, day and year swapped. It was live in
 * thirteen places, including the manifest a driver signs and the tracking page a customer reads,
 * and an LTR island cannot fix it — the marks are inside the string, so forcing LTR renders
 * "212026/8/" instead. The product now has exactly two date formats, both spelled-month, both
 * mark-free by construction.
 */

const BIDI = /[‎‏]/;

test.describe("date and number formatting", () => {
  test("the canonical date formats carry no bidi marks", () => {
    const d = new Date("2026-08-21T07:40:00Z");
    expect(formatDate(d)).toBe("21 أغسطس 2026");
    expect(formatDate(d)).not.toMatch(BIDI);
    expect(formatDateStamp(d)).toMatch(/^21 أغسطس 2026 · \d{1,2}:\d{2}/);
    expect(formatDateStamp(d)).not.toMatch(BIDI);
    // day and year in reading order, never reversed
    expect(formatDate(d).indexOf("21")).toBeLessThan(formatDate(d).indexOf("2026"));
  });

  test("phone numbers are grouped for reading aloud", () => {
    expect(formatPhoneDisplay("+967771234567")).toBe("+967 771 234 567");
    expect(formatPhoneDisplay("0771234567")).toBe("+967 771 234 567"); // local form normalises first
    expect(formatPhoneDisplay("0501234567")).toBe("+966 501 234 567");
    expect(formatPhoneDisplay("")).toBe("—");
    expect(formatPhoneDisplay(null)).toBe("—");
    // Unrecognised numbers show verbatim — the same string a failed-send row will quote, rather
    // than a prettified version of something dispatch cannot actually use.
    expect(formatPhoneDisplay("12345")).toBe("12345");
  });

  test("no screen renders a bidi-marked date", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    const s = await createTestShipment({
      companyId: t.company.id, customerId: t.customerId,
      loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 4,
      status: "READY_FOR_PICKUP", shippingPrice: 45000, amountPaid: 12000,
    });
    await prisma.trackingEvent.create({
      data: { shipmentId: s.id, eventType: "RECEIVED", title: "تم استلام الشحنة" },
    });

    await login(page, t.adminEmail);
    for (const url of ["/app/shipments", `/app/shipments/${s.id}`, "/app/customers", "/app/activity"]) {
      await page.goto(url);
      await page.locator("h1").first().waitFor();
      const body = await page.locator("body").innerText();
      expect(body, `bidi-marked date on ${url}`).not.toMatch(BIDI);
      // and the reversed shape itself must not appear anywhere
      expect(body, `reversed date on ${url}`).not.toMatch(/\b20\d\d\/\d{1,2}\/\d{1,2}\b/);
    }
    await cleanupTenant(t.company.id);
  });

  test("the money column aligns with its own header", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    for (const [price, paid] of [[40000, 0], [120000, 0], [8000, 8000]]) {
      await createTestShipment({
        companyId: t.company.id, customerId: t.customerId, loadBranchId: a.id, unloadBranchId: b.id,
        cartonCount: 2, status: "IN_TRANSIT", shippingPrice: price, amountPaid: paid,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, t.adminEmail);
    await page.goto("/app/shipments");
    await page.locator("table").waitFor();

    // The header and every figure under it share one edge, and the figures share it with each
    // other — which is the only way a column of money can be compared down the page.
    const edges = await page.evaluate(() => {
      const heads = [...document.querySelectorAll("thead th")];
      const i = heads.findIndex((h) => h.textContent?.includes("المتبقي"));
      const head = heads[i].getBoundingClientRect();
      const cells = [...document.querySelectorAll("tbody tr")].map((r) => {
        const td = r.querySelectorAll("td")[i] as HTMLElement;
        const span = (td.querySelector("span") ?? td) as HTMLElement;
        // The cell is dir="ltr", so text-end pins the *right* edge — which is precisely what
        // units-over-units alignment means for a column of figures.
        return { text: span.innerText.trim(), right: Math.round(span.getBoundingClientRect().right) };
      });
      return { headLeft: Math.round(head.left), headRight: Math.round(head.right), cells };
    });

    const rights = new Set(edges.cells.map((c) => c.right));
    expect(rights.size, `figures must share one edge, got ${JSON.stringify(edges.cells)}`).toBe(1);
    expect(edges.cells.some((c) => c.text.includes("120,000"))).toBe(true);

    await cleanupTenant(t.company.id);
  });
});
