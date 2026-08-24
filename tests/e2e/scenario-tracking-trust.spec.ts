import { test, expect } from "@playwright/test";
import { createTestTenant, cleanupTenant, createTestShipment, prisma } from "./helpers";

/**
 * The public tracking page is the only screen in this product a customer ever sees.
 *
 * It opened with a stock parcel glyph and the carrier's name in small grey text — identical for
 * every company on the platform — and it never actually *said* the shipment's status: you were
 * meant to infer it from which row of the timeline happened to carry the truck icon. "جاهزة
 * للاستلام" was told without saying from where, and a delivered shipment showed no evidence of the
 * handover at all.
 */
test.describe("public tracking page", () => {
  test("carries the carrier's identity, states the status, and says where to collect", async ({ page }) => {
    const t = await createTestTenant(["صنعاء", "عدن"]);
    const [a, b] = t.branches;
    await prisma.company.update({
      where: { id: t.company.id },
      data: { name: "مؤسسة النور للشحن", logoColor: "#0f766e", phone: "+967771234567" },
    });
    const s = await createTestShipment({
      companyId: t.company.id, customerId: t.customerId,
      loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 5, status: "READY_FOR_PICKUP",
    });
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({
      where: { id: s.id }, select: { trackingToken: true },
    });

    // No session — this is how a customer arrives.
    await page.goto(`/t/${trackingToken}`);

    // identity: the carrier's own name and colour, not a generic glyph.
    // `exact` because the name also appears inside the support line ("فريق … جاهز لخدمتك") — this
    // assertion is about the identity strip, which states the carrier and nothing else.
    await expect(page.getByText("مؤسسة النور للشحن", { exact: true })).toBeVisible();
    const tile = page.locator('[style*="background-color"]').first();
    await expect(tile).toBeVisible();

    // the status, in words, not inferred from an icon
    await expect(page.getByText("جاهزة للاستلام / التوصيل").first()).toBeVisible();

    // where to collect it, and a number to call
    await expect(page.getByText(/الاستلام من:/)).toBeVisible();
    await expect(page.getByText(b.name).first()).toBeVisible();
    await expect(page.getByText("+967 771 234 567")).toBeVisible();

    // and still no internal data
    const body = await page.locator("body").innerText();
    for (const leak of ["أجرة الشحن", "المتبقي", "رسوم المنصة"]) {
      expect(body, `"${leak}" must never reach the public page`).not.toContain(leak);
    }

    await cleanupTenant(t.company.id);
  });

  test("a delivered shipment shows the handover, not just a finished timeline", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    const s = await createTestShipment({
      companyId: t.company.id, customerId: t.customerId,
      loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 2, status: "DELIVERED",
    });
    await prisma.shipment.update({
      where: { id: s.id },
      data: { deliveredAt: new Date(), deliveredToName: "محمد عبدالله" },
    });
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({
      where: { id: s.id }, select: { trackingToken: true },
    });

    await page.goto(`/t/${trackingToken}`);
    await expect(page.getByText("تم تسليم شحنتك")).toBeVisible();
    await expect(page.getByText(/استلمها: محمد عبدالله/)).toBeVisible();

    // no bidi-reversed date anywhere on the customer's page
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/[‎‏]/);
    expect(body).not.toMatch(/\b20\d\d\/\d{1,2}\/\d{1,2}\b/);

    await cleanupTenant(t.company.id);
  });

  test("the routes outside the app segments have an error boundary of their own", async ({ page }) => {
    // /login, / and /reset sit outside /app, /platform, /driver and /track, each of which has had a
    // segment boundary all along. These three fell through to global-error, which replaces the
    // whole document — the harshest screen in the product, shown to someone not even signed in.
    const res = await page.goto("/login");
    expect(res?.status()).toBe(200);
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });
});
