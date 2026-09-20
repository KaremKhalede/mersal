import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, cleanupTenant, visibleText } from "./helpers";
import { lookupShipmentAction } from "../../src/app/track/actions";

/**
 * PUBLIC SHIPMENT LOOKUP — the customer's way back in.
 *
 * The load-bearing claim is a security one: a shipment number is generated from a Postgres
 * sequence and is guessable on purpose (src/lib/ids.ts), so the lookup must hand back a READ and
 * nothing more. If it ever leaked the tracking token, a walked sequence plus a 10,000-combination
 * guess would authorize redirecting real cartons — the exact hole src/lib/tracking.ts was written
 * to close. These tests pin that boundary from both sides: the payload, and the rendered page.
 */

/** A shipment sitting at its destination — the stage where the token route DOES offer the
 *  pickup/home-delivery controls, so it is the stage where their absence here means something. */
async function arrivedShipment(tenant: Awaited<ReturnType<typeof createTestTenant>>) {
  const [origin, destination] = tenant.branches;
  return createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount: 4,
    status: "ARRIVED",
    receiverPhone: "+967700114567",
  });
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

test.describe("The bare domain serves customers, not a staff password field", () => {
  test("an anonymous visitor to / lands on the marketing home, can reach tracking without knowing the URL, and can still reach login", async ({ page }) => {
    // The bare domain is now the marketing landing page (Hero, features, FAQ, ... — the product's
    // own spec calls for it), not a bare redirect to /track. What this test actually guards is the
    // load-bearing claim in its own title: a customer with only a shipment number, and a staff
    // member with only a password, must each have a visible, one-click way to their own page from
    // here — neither should have to already know a URL by heart.
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    await page.getByRole("link", { name: /تتبّع شحنتك/ }).click();
    await expect(page).toHaveURL(/\/track$/);
    await expect(visibleText(page, "تتبّع شحنتك").first()).toBeVisible();

    // Scoped to the nav bar ("banner" landmark) — the landing page repeats a "تسجيل الدخول" link in
    // its hero, its contact section, and its footer too, so an unscoped lookup is ambiguous.
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: /تسجيل الدخول/ }).click();
    await expect(page).toHaveURL(/\/login/);
    // And back the other way, for anyone who bookmarked the login screen with only a shipment to
    // check on.
    await page.getByRole("link", { name: /تتبّع شحنة/ }).click();
    await expect(page).toHaveURL(/\/track$/);
  });
});

test.describe("Looking up a shipment", () => {
  test("the right number and the right last-4 render the tracking card", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await arrivedShipment(tenant);

    await page.context().clearCookies();
    await page.goto("/track");
    await page.fill('input[name="shipmentNumber"]', shipment.shipmentNumber);
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تتبّع الشحنة/ }).click();

    await expect(visibleText(page, shipment.shipmentNumber).first()).toBeVisible();
    await expect(visibleText(page, tenant.company.name).first()).toBeVisible();
    await expect(visibleText(page, "وصلت الفرع").first()).toBeVisible();
    // One cell states both numbers ("4 من 4") where the card used to carry two tiles. A shipment
    // that arrived short therefore still shows its shortfall here, not only in the warning above.
    await expect(visibleText(page, "عدد الكراتين").first()).toBeVisible();
    // "0 من 4": the fixture leaves arrivedCartons at zero, which is precisely the case both
    // numbers exist for — a single "4" would tell this customer their whole shipment is on the
    // shelf when none of it is.
    await expect(visibleText(page, "0 من 4").first()).toBeVisible();

    // A way back to the form without reloading — a customer usually has more than one shipment.
    await page.getByRole("button", { name: /تتبع شحنة أخرى/ }).click();
    await expect(visibleText(page, "تتبّع شحنتك").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a lowercase or padded number still finds the shipment", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await arrivedShipment(tenant);

    const result = await lookupShipmentAction(
      form({ shipmentNumber: `  ${shipment.shipmentNumber.toLowerCase()}  `, last4: "4567" })
    );
    expect("shipment" in result).toBe(true);

    // Arabic-Indic digits are what an Arabic keyboard produces, and they are a correct answer.
    const arabicDigits = await lookupShipmentAction(
      form({ shipmentNumber: shipment.shipmentNumber, last4: "٤٥٦٧" })
    );
    expect("shipment" in arabicDigits).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("input mistakes get a specific message; a failed match gets one generic message", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await arrivedShipment(tenant);

    // Shape checks are specific — they are decided before any database read and leak nothing.
    expect(await lookupShipmentAction(form({ shipmentNumber: "", last4: "4567" }))).toEqual({
      error: expect.stringContaining("أدخل رقم الشحنة"),
    });
    expect(await lookupShipmentAction(form({ shipmentNumber: shipment.shipmentNumber, last4: "" }))).toEqual({
      error: expect.stringContaining("أدخل آخر 4 أرقام"),
    });
    expect(await lookupShipmentAction(form({ shipmentNumber: shipment.shipmentNumber, last4: "45" }))).toEqual({
      error: expect.stringContaining("أربعة أرقام"),
    });

    // THE anti-oracle property: "no such shipment" and "wrong digits" are indistinguishable, so a
    // walked sequence cannot be used to discover which numbers are real.
    const unknownNumber = await lookupShipmentAction(form({ shipmentNumber: "SH-999999999", last4: "4567" }));
    const wrongDigits = await lookupShipmentAction(form({ shipmentNumber: shipment.shipmentNumber, last4: "0000" }));
    expect(unknownNumber).toEqual(wrongDigits);
    expect("error" in unknownNumber && unknownNumber.error).toContain("لم نجد شحنة");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("A lookup grants a read, never a capability", () => {
  test("the returned payload carries no tracking token and no sender or receiver identity", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await arrivedShipment(tenant);
    const full = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
      include: { customer: true },
    });

    const result = await lookupShipmentAction(form({ shipmentNumber: shipment.shipmentNumber, last4: "4567" }));
    expect("shipment" in result).toBe(true);
    const payload = JSON.stringify(result);

    // The credential that authorizes redirecting cartons must not appear anywhere in the response.
    expect(payload).not.toContain(full.trackingToken);
    // Nor the identities the tracking card never displays: the sender, and the receiver's number
    // (the last four of which the caller had to know, but the full number they did not).
    expect(payload).not.toContain(full.customer.name);
    expect(payload).not.toContain(full.customer.phone);
    expect(payload).not.toContain(full.receiverPhone);
    expect(payload).not.toContain(full.receiverName);

    await cleanupTenant(tenant.company.id);
  });

  test("the lookup result offers no pickup or delivery controls, and says where they live", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await arrivedShipment(tenant);

    await page.context().clearCookies();
    await page.goto("/track");
    await page.fill('input[name="shipmentNumber"]', shipment.shipmentNumber);
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تتبّع الشحنة/ }).click();
    await expect(visibleText(page, shipment.shipmentNumber).first()).toBeVisible();

    // An ARRIVED shipment is exactly the stage the token route offers these at — their absence
    // here is the boundary, not an artefact of the shipment's status.
    //
    // Asserted by ROLE, not by text: the footnote below deliberately names both options in prose
    // ("...(استلام من الفرع أو توصيل إلى العنوان)...") to tell the customer where the controls are,
    // so a bare text= locator matches the explanation instead of the button it is explaining.
    await expect(page.getByRole("button", { name: "استلام من الفرع" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "توصيل للمنزل" })).toHaveCount(0);
    // The customer is told where the controls are rather than left wondering.
    await expect(visibleText(page, "استخدم رابط التتبع").first()).toBeVisible();

    // And the token never reaches the browser at all.
    const token = (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).trackingToken;
    expect(await page.content()).not.toContain(token);
    await expect(page).toHaveURL(/\/track$/);

    await cleanupTenant(tenant.company.id);
  });

  test("the token route still offers the controls, unchanged", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await arrivedShipment(tenant);
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });

    await page.context().clearCookies();
    await page.goto(`/t/${trackingToken}`);
    await expect(visibleText(page, shipment.shipmentNumber).first()).toBeVisible();
    // The whole point of keeping the two paths on one shared card: this one still acts.
    await expect(page.getByRole("button", { name: "استلام من الفرع" })).toBeVisible();
    await expect(page.getByRole("button", { name: "توصيل للمنزل" })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("One company's shipment is not another's", () => {
  test("a lookup crosses no tenant boundary and shows only the owning carrier", async ({ page }) => {
    const one = await createTestTenant(["الرياض", "سيئون"]);
    const two = await createTestTenant(["عدن", "المكلا"]);
    const theirs = await arrivedShipment(two);

    await page.context().clearCookies();
    await page.goto("/track");
    await page.fill('input[name="shipmentNumber"]', theirs.shipmentNumber);
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تتبّع الشحنة/ }).click();

    // The lookup is company-agnostic by design — a shipment number is globally unique — but the
    // page must show the carrier that actually holds the goods, and nobody else's name.
    await expect(visibleText(page, two.company.name).first()).toBeVisible();
    await expect(page.locator(`text=${one.company.name}`)).toHaveCount(0);

    await cleanupTenant(one.company.id);
    await cleanupTenant(two.company.id);
  });
});
