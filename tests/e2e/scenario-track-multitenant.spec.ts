import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, cleanupTenant, visibleText } from "./helpers";
import { lookupShipmentAction } from "../../src/app/track/actions";

/**
 * ONE TRACKING PAGE, MANY CARRIERS.
 *
 * The claims this pins, in order of how much damage getting them wrong would do:
 *
 *   1. company A's branded page cannot resolve company B's shipment — even with the right number
 *      and the right digits, and even though shipment numbers are globally unique;
 *   2. /track/<company>/<SH-…> is an ADDRESS, not a key: reaching it discloses nothing, because
 *      shipment numbers come from a sequence and are guessable by design;
 *   3. the carrier's identity is what the customer sees; Chargee's is not on the page at all;
 *   4. a suspended carrier stops serving its branded page, its logo, and its lookups.
 */

async function carrierWithShipment(slug: string, name: string, cities: [string, string]) {
  const tenant = await createTestTenant(cities);
  await prisma.company.update({
    where: { id: tenant.company.id },
    data: { slug, name, logoColor: "#0f766e", phone: "+967771234567" },
  });
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: tenant.branches[0].id,
    unloadBranchId: tenant.branches[1].id,
    cartonCount: 3,
    status: "ARRIVED",
    receiverPhone: "+967700114567",
  });
  return { tenant, shipment };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

test.describe("A carrier's page serves that carrier only", () => {
  test("company A cannot resolve company B's shipment, and is told nothing about why", async ({ page }) => {
    const stamp = Date.now();
    const a = await carrierWithShipment(`alpha-${stamp}`, "شركة ألفا للشحن", ["الرياض", "المكلا"]);
    const b = await carrierWithShipment(`beta-${stamp}`, "شركة بيتا للشحن", ["عدن", "سيئون"]);

    // Right number, right digits, wrong carrier's page — refused.
    const crossTenant = await lookupShipmentAction(
      form({ shipmentNumber: b.shipment.shipmentNumber, last4: "4567", companySlug: `alpha-${stamp}` })
    );
    expect("error" in crossTenant).toBe(true);

    // And refused with the SAME words as a number that does not exist, so the branded page cannot
    // be used to discover which numbers belong to which tenant.
    const unknown = await lookupShipmentAction(
      form({ shipmentNumber: "SH-999999999", last4: "4567", companySlug: `alpha-${stamp}` })
    );
    expect(crossTenant).toEqual(unknown);

    // On its own carrier's page the very same shipment resolves.
    const ownTenant = await lookupShipmentAction(
      form({ shipmentNumber: b.shipment.shipmentNumber, last4: "4567", companySlug: `beta-${stamp}` })
    );
    expect("shipment" in ownTenant).toBe(true);

    // Through the UI, end to end.
    await page.context().clearCookies();
    await page.goto(`/track/alpha-${stamp}`);
    await page.fill('input[name="shipmentNumber"]', b.shipment.shipmentNumber);
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تتبّع الشحنة/ }).click();
    await expect(visibleText(page, "لم نجد شحنة").first()).toBeVisible();
    await expect(page.locator("text=شركة بيتا للشحن")).toHaveCount(0);

    await cleanupTenant(a.tenant.company.id);
    await cleanupTenant(b.tenant.company.id);
  });

  test("the unbranded fallback still resolves any carrier, and dresses the result in theirs", async ({ page }) => {
    const stamp = Date.now();
    const a = await carrierWithShipment(`gamma-${stamp}`, "شركة جاما للشحن", ["الرياض", "المكلا"]);

    await page.context().clearCookies();
    await page.goto("/track");
    // No carrier is known before the number resolves — the bar states the page's purpose instead.
    await expect(visibleText(page, "تتبّع شحنة").first()).toBeVisible();

    await page.fill('input[name="shipmentNumber"]', a.shipment.shipmentNumber);
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تتبّع الشحنة/ }).click();

    // ...and once it does, the result carries the carrier that actually owns it.
    await expect(visibleText(page, "شركة جاما للشحن").first()).toBeVisible();

    await cleanupTenant(a.tenant.company.id);
  });
});

test.describe("The deep link is an address, not a key", () => {
  test("reaching /track/<company>/<number> pre-fills the field and discloses nothing", async ({ page }) => {
    const stamp = Date.now();
    const a = await carrierWithShipment(`delta-${stamp}`, "شركة دلتا للشحن", ["الرياض", "المكلا"]);

    await page.context().clearCookies();
    await page.goto(`/track/delta-${stamp}/${a.shipment.shipmentNumber}`);

    // The number is there to save typing — it is printed on the customer's own receipt.
    await expect(page.locator('input[name="shipmentNumber"]')).toHaveValue(a.shipment.shipmentNumber);
    // But nothing about the shipment has been read: no status, no route, no timeline.
    await expect(page.locator("text=تتبع الشحنة")).toHaveCount(0);
    await expect(page.locator("text=وصلت الفرع")).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("مستلم اختبار");

    // The last four is still the gate.
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تتبّع الشحنة/ }).click();
    await expect(visibleText(page, "تتبع الشحنة").first()).toBeVisible();

    await cleanupTenant(a.tenant.company.id);
  });

  test("an unknown carrier slug is a plain 404 on both branded routes", async ({ page }) => {
    await page.context().clearCookies();
    for (const path of ["/track/no-such-carrier-xyz", "/track/no-such-carrier-xyz/SH-100001"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });
});

test.describe("The carrier is the brand; Chargee is not on the page", () => {
  test("the branded page and the token link both carry the carrier, and never the platform", async ({ page }) => {
    const stamp = Date.now();
    const a = await carrierWithShipment(`epsilon-${stamp}`, "شركة إبسلون للشحن", ["الرياض", "المكلا"]);
    const platform = await prisma.platform.findFirstOrThrow();
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({ where: { id: a.shipment.id } });

    await page.context().clearCookies();

    for (const path of [`/track/epsilon-${stamp}`, `/t/${trackingToken}`]) {
      await page.goto(path);
      await expect(visibleText(page, "شركة إبسلون للشحن").first(), path).toBeVisible();
      // The platform's own name must not appear anywhere a customer can read it.
      const body = await page.locator("body").innerText();
      expect(body, `platform name leaked on ${path}`).not.toContain(platform.name);
    }

    await cleanupTenant(a.tenant.company.id);
  });

  test("a carrier with no uploaded logo falls back to its own colour and initial", async ({ page }) => {
    const stamp = Date.now();
    const a = await carrierWithShipment(`zeta-${stamp}`, "شركة زيتا للشحن", ["الرياض", "المكلا"]);

    await page.context().clearCookies();
    await page.goto(`/track/zeta-${stamp}`);

    // No <img> for a carrier that never uploaded one, and no broken request for it either.
    await expect(page.locator(`img[src="/api/track/logo/zeta-${stamp}"]`)).toHaveCount(0);
    await expect(page.locator('[style*="background-color"]').first()).toBeVisible();

    // The public logo route 404s rather than erroring when there is nothing to serve.
    const res = await page.request.get(`/api/track/logo/zeta-${stamp}`);
    expect(res.status()).toBe(404);

    await cleanupTenant(a.tenant.company.id);
  });
});

test.describe("A suspended carrier stops serving", () => {
  test("its branded page, its lookups and its logo all go dark; the token link still works", async ({ page }) => {
    const stamp = Date.now();
    const a = await carrierWithShipment(`eta-${stamp}`, "شركة إيتا للشحن", ["الرياض", "المكلا"]);
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({ where: { id: a.shipment.id } });
    await prisma.company.update({ where: { id: a.tenant.company.id }, data: { status: "SUSPENDED" } });

    await page.context().clearCookies();

    const branded = await page.goto(`/track/eta-${stamp}`);
    expect(branded?.status()).toBe(404);

    const logo = await page.request.get(`/api/track/logo/eta-${stamp}`);
    expect(logo.status()).toBe(404);

    const denied = await lookupShipmentAction(
      form({ shipmentNumber: a.shipment.shipmentNumber, last4: "4567" })
    );
    expect("error" in denied).toBe(true);

    // The token link keeps working on purpose: the customer holds a link to goods that physically
    // exist and may still be sitting in a branch. Losing sight of them is not a sanction that
    // belongs on the customer.
    const token = await page.goto(`/t/${trackingToken}`);
    expect(token?.status()).toBe(200);
    await expect(visibleText(page, "شركة إيتا للشحن").first()).toBeVisible();

    await cleanupTenant(a.tenant.company.id);
  });
});
