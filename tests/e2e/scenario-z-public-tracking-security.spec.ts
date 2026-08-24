import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant, pollUntil } from "./helpers";
import { matchesPhoneLast4, newTrackingToken } from "../../src/lib/tracking";

/**
 * P0-1 regression suite — the public tracking surface.
 *
 * Before this batch, /track/<shipmentNumber> was keyed by a 5-digit "SH-#####" label (fewer than
 * 90,000 possibilities) and the pickup/delivery actions authorized on nothing but knowledge of that
 * label. Guessing a number for an arrived shipment was enough to redirect real cartons to an
 * attacker-chosen address. Each test below pins one part of that fix shut.
 */

/** The fixture's receiverPhone is +967700000000, so the correct proof is "0000". */
const CORRECT_LAST4 = "0000";
const WRONG_LAST4 = "1234";

async function arrivedShipment() {
  const tenant = await createTestTenant(["الرياض", "المكلا"]);
  const [loadBranch, unloadBranch] = tenant.branches;
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: loadBranch.id,
    unloadBranchId: unloadBranch.id,
    cartonCount: 2,
    status: "ARRIVED",
  });
  await prisma.shipment.update({ where: { id: shipment.id }, data: { arrivedCartons: 2 } });
  const row = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
  return { tenant, shipment, row };
}

test.describe("Scenario Z — public tracking security (P0-1)", () => {
  test("the tracking token is high-entropy, URL-safe and collision-free", async () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newTrackingToken()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) {
      expect(t.length).toBeGreaterThanOrEqual(22);
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  test("a shipment's token is unrelated to its shipment number", async () => {
    const { tenant, row } = await arrivedShipment();
    expect(row.trackingToken).toBeTruthy();
    expect(row.trackingToken).not.toContain(row.shipmentNumber);
    expect(row.shipmentNumber).not.toContain(row.trackingToken);
    await cleanupTenant(tenant.company.id);
  });

  test("the old enumerable URL no longer resolves — a shipment number is not a credential", async ({ page }) => {
    const { tenant, row } = await arrivedShipment();

    await page.goto(`/t/${row.shipmentNumber}`);
    // The customer-facing not-found screen, and no trace of the shipment behind it.
    await expect(page.locator("text=لم نجد هذه الشحنة").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(row.shipmentNumber);

    await cleanupTenant(tenant.company.id);
  });

  test("a random token resolves to nothing", async ({ page }) => {
    await page.goto(`/t/${newTrackingToken()}`);
    await expect(page.locator("text=لم نجد هذه الشحنة").first()).toBeVisible();
  });

  test("the real token opens the page — reading stays frictionless", async ({ page }) => {
    const { tenant, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    await expect(page.locator(`text=${row.shipmentNumber}`).first()).toBeVisible();
    // Nothing is demanded just to look.
    await expect(page.locator('input[name="last4"]')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("choosing branch pickup requires the receiver's last 4 digits", async ({ page }) => {
    const { tenant, shipment, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    await page.click('button:has-text("استلام من الفرع")');

    await page.fill('input[name="last4"]', WRONG_LAST4);
    await page.click('button:has-text("تأكيد")');
    await expect(page.locator("text=تعذّر التحقق").first()).toBeVisible();

    const afterReject = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(afterReject.deliveryMethod).toBeNull();

    await page.fill('input[name="last4"]', CORRECT_LAST4);
    await page.click('button:has-text("تأكيد")');
    const updated = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.deliveryMethod === "PICKUP"
    );
    expect(updated.deliveryMethod).toBe("PICKUP");

    await cleanupTenant(tenant.company.id);
  });

  test("a home-delivery request with the wrong digits creates no DeliveryRequest at all", async ({ page }) => {
    const { tenant, shipment, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    await page.click('button:has-text("توصيل للمنزل")');
    await page.fill('textarea[name="destinationAddress"]', "عنوان المهاجم");
    await page.fill('input[name="last4"]', WRONG_LAST4);
    await page.click('button:has-text("تأكيد طلب التوصيل")');
    await expect(page.locator("text=تعذّر التحقق").first()).toBeVisible();

    expect(await prisma.deliveryRequest.count({ where: { shipmentId: shipment.id } })).toBe(0);
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.status).toBe("ARRIVED");

    await cleanupTenant(tenant.company.id);
  });

  test("even a verified public request cannot dispatch goods — it lands PENDING for branch review", async ({ page }) => {
    const { tenant, shipment, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    await page.click('button:has-text("توصيل للمنزل")');
    await page.fill('textarea[name="destinationAddress"]', "المكلا - حي الديس");
    await page.fill('input[name="last4"]', CORRECT_LAST4);
    await page.click('button:has-text("تأكيد طلب التوصيل")');

    const req = await pollUntil(
      () => prisma.deliveryRequest.findFirst({ where: { shipmentId: shipment.id } }),
      (r) => r !== null
    );
    // The third layer of P0-1: no provider handoff from an unauthenticated caller.
    expect(req!.status).toBe("PENDING");
    expect(req!.providerRef).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("the branch confirms a customer request before anything is dispatched", async ({ page }) => {
    const { tenant, shipment, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    await page.click('button:has-text("توصيل للمنزل")');
    await page.fill('textarea[name="destinationAddress"]', "المكلا - حي الديس");
    await page.fill('input[name="last4"]', CORRECT_LAST4);
    await page.click('button:has-text("تأكيد طلب التوصيل")');
    await pollUntil(
      () => prisma.deliveryRequest.count({ where: { shipmentId: shipment.id, status: "PENDING" } }),
      (n) => n === 1
    );

    await login(page, tenant.adminEmail);
    await page.goto("/app/delivery");
    await page.click('button:has-text("مراجعة وتأكيد الطلب")');

    const confirmed = await pollUntil(
      () => prisma.deliveryRequest.findFirstOrThrow({ where: { shipmentId: shipment.id } }),
      (r) => r.status === "ASSIGNED"
    );
    expect(confirmed.providerRef).toBeTruthy(); // dispatched only now

    await cleanupTenant(tenant.company.id);
  });

  test("acting on one shipment never touches another — no client-supplied shipment id exists", async ({ page }) => {
    const a = await arrivedShipment();
    const b = await arrivedShipment();

    await page.goto(`/t/${a.row.trackingToken}`);
    await page.click('button:has-text("استلام من الفرع")');
    await page.fill('input[name="last4"]', CORRECT_LAST4);
    await page.click('button:has-text("تأكيد")');
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: a.shipment.id } }),
      (s) => s.deliveryMethod === "PICKUP"
    );

    const untouchedB = await prisma.shipment.findUniqueOrThrow({ where: { id: b.shipment.id } });
    expect(untouchedB.deliveryMethod).toBeNull();

    await cleanupTenant(a.tenant.company.id);
    await cleanupTenant(b.tenant.company.id);
  });

  test("a shipment still in transit cannot have its handover method changed", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 1,
      status: "IN_TRANSIT",
    });
    const row = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });

    await page.goto(`/t/${row.trackingToken}`);
    await expect(page.locator('button:has-text("استلام من الفرع")')).toHaveCount(0);

    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.deliveryMethod).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("a rejected attempt keeps what the customer typed — retrying costs one field, not the whole form", async ({ page }) => {
    const { tenant, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    await page.click('button:has-text("توصيل للمنزل")');
    await page.fill('textarea[name="destinationAddress"]', "المكلا - حي الديس - شارع 14");
    await page.fill('textarea[name="notes"]', "الاتصال قبل الوصول");
    await page.fill('input[name="last4"]', WRONG_LAST4);
    await page.click('button:has-text("تأكيد طلب التوصيل")');
    await expect(page.locator("text=تعذّر التحقق").first()).toBeVisible();

    // React 19 resets an uncontrolled <form action> even when the action returns an error, which
    // used to wipe the address after a single mistyped digit — unacceptable on a phone.
    await expect(page.locator('textarea[name="destinationAddress"]')).toHaveValue("المكلا - حي الديس - شارع 14");
    await expect(page.locator('textarea[name="notes"]')).toHaveValue("الاتصال قبل الوصول");

    await cleanupTenant(tenant.company.id);
  });
  test("the public page exposes no internal identifiers or staff data", async ({ page }) => {
    const { tenant, shipment, row } = await arrivedShipment();

    await page.goto(`/t/${row.trackingToken}`);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(shipment.id);
    expect(body).not.toContain(tenant.company.id);
    expect(body).not.toContain(tenant.adminEmail);
    // The verification answer itself must never be shown on the page that asks for it.
    expect(body).not.toContain(row.receiverPhone);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("matchesPhoneLast4 — the verification rule itself", () => {
  const cases: [string | null, string, boolean][] = [
    ["+967700000000", "0000", true],
    ["+966501234567", "4567", true],
    ["+966501231234", "١٢٣٤", true], // Arabic-Indic input normalizes before comparing
    ["+966501234567", "١٢٣٤", false],
    ["+966501234567", "567", false], // too short
    ["+966501234567", "45678", false], // too long
    ["+966501234567", "0000", false],
    ["123", "0123", false], // fewer than 4 digits on file fails closed
    [null, "0000", false],
    ["+966501234567", "", false],
  ];
  for (const [phone, input, expected] of cases) {
    test(`matchesPhoneLast4(${phone ?? "null"}, "${input}") -> ${expected}`, () => {
      expect(matchesPhoneLast4(phone, input)).toBe(expected);
    });
  }
});
