import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, cleanupTenant, visibleText } from "./helpers";

/**
 * THE RESULT CARD MUST NOT CLAIM MORE THAN IT KNOWS.
 *
 * Four separate ways the card was overstating or understating the truth, each pinned here:
 *
 *   1. every event in the timeline has already happened, so none of them may render in the tone
 *      reserved for a step that has not;
 *   2. the route marker reflects the recorded STAGE, never a position — and a delivered shipment
 *      shows no vehicle between two cities at all;
 *   3. the handover cell states what was RECORDED at handover, and is omitted rather than printing
 *      "لم تُحدَّد بعد" — an absence of data is not a fact about someone's shipment;
 *   4. the WhatsApp link opens a conversation that already names the shipment.
 */

async function shipmentWithEvents(
  tenant: Awaited<ReturnType<typeof createTestTenant>>,
  opts: { status: string; arrived: number; channel?: string; method?: string; events: string[] }
) {
  const s = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: tenant.branches[0].id,
    unloadBranchId: tenant.branches[1].id,
    cartonCount: 5,
    status: opts.status,
    receiverPhone: "+967700114567",
  });
  await prisma.shipment.update({
    where: { id: s.id },
    data: {
      arrivedCartons: opts.arrived,
      ...(opts.channel ? { deliveryChannel: opts.channel, deliveredAt: new Date(), deliveredToName: "أحمد سالم" } : {}),
      ...(opts.method ? { deliveryMethod: opts.method } : {}),
    },
  });
  for (const [i, title] of opts.events.entries()) {
    await prisma.trackingEvent.create({
      data: {
        shipmentId: s.id,
        eventType: "X",
        title,
        description: `${title} — تفصيل`,
        createdAt: new Date(Date.now() - (opts.events.length - i) * 864e5),
      },
    });
  }
  return prisma.shipment.findUniqueOrThrow({ where: { id: s.id } });
}

test.describe("The timeline shows what happened, not what is pending", () => {
  test("every recorded event renders as completed; the newest is the emphasized one", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const s = await shipmentWithEvents(tenant, {
      status: "DELIVERED",
      arrived: 5,
      channel: "BRANCH_PICKUP",
      events: ["تم استلام الشحنة", "تم تحميل الشحنة على الرحلة", "وصلت إلى مركز الوجهة", "تم التسليم"],
    });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);
    await expect(visibleText(page, "تتبع الشحنة").first()).toBeVisible();

    // Not one row may carry the pale "has not happened yet" state — the whole list already did.
    await expect(page.locator('.track-timeline__item[data-state="todo"]')).toHaveCount(0);
    // The newest is filled; the rest are complete, and look it.
    await expect(page.locator('.track-timeline__item[data-state="latest"]')).toHaveCount(1);
    await expect(page.locator('.track-timeline__item[data-state="done"]').first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment with no events yet falls back to the curated steps, which DO have pending ones", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const s = await shipmentWithEvents(tenant, { status: "RECEIVED", arrived: 0, events: [] });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);

    // The fallback is the only place "todo" is honest: those steps genuinely have not occurred.
    await expect(page.locator('.track-timeline__item[data-state="todo"]').first()).toBeVisible();
    await expect(visibleText(page, "تم استلام الشحنة").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("The route strip reflects a stage, never a position", () => {
  test("a delivered shipment reads as arrived, with no vehicle left between the cities", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const s = await shipmentWithEvents(tenant, {
      status: "DELIVERED",
      arrived: 5,
      channel: "BRANCH_PICKUP",
      events: ["تم التسليم"],
    });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);

    await expect(page.locator(".track-route[data-arrived]")).toHaveCount(1);
    await expect(visibleText(page, "وصلت إلى المكلا").first()).toBeVisible();
    // The traversed portion is the whole line.
    const width = await page.locator(".track-route__line--done").evaluate((el) => (el as HTMLElement).style.inlineSize);
    expect(width).toBe("100%");

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment still travelling is short of its destination, and the destination is not filled", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const s = await shipmentWithEvents(tenant, { status: "IN_TRANSIT", arrived: 0, events: ["في الطريق"] });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);

    await expect(page.locator(".track-route[data-arrived]")).toHaveCount(0);
    const width = await page.locator(".track-route__line--done").evaluate((el) => (el as HTMLElement).style.inlineSize);
    expect(parseInt(width, 10)).toBeGreaterThan(0);
    expect(parseInt(width, 10)).toBeLessThan(100);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("The handover cell states a recorded fact or nothing", () => {
  test("a delivered shipment shows the channel that was actually recorded", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    // The customer once chose home delivery; the cartons were in fact collected at the counter.
    // The card must state what happened, not what was intended.
    const s = await shipmentWithEvents(tenant, {
      status: "DELIVERED",
      arrived: 5,
      channel: "BRANCH_PICKUP",
      method: "HOME_DELIVERY",
      events: ["تم التسليم"],
    });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);

    await expect(visibleText(page, "استلام من الفرع").first()).toBeVisible();
    await expect(page.locator("text=توصيل إلى العنوان")).toHaveCount(0);
    await expect(page.locator("text=لم تُحدَّد بعد")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment with neither recorded omits the cell instead of announcing the gap", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const s = await shipmentWithEvents(tenant, { status: "IN_TRANSIT", arrived: 0, events: ["في الطريق"] });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);

    await expect(page.locator("text=لم تُحدَّد بعد")).toHaveCount(0);
    await expect(page.locator("text=طريقة الاستلام")).toHaveCount(0);
    // The other two facts are still there — the row narrows, it does not disappear.
    await expect(visibleText(page, "تاريخ الشحن").first()).toBeVisible();
    await expect(visibleText(page, "عدد الكراتين").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Getting help is one tap, and the office knows why", () => {
  test("the WhatsApp link is a real button and opens a conversation naming the shipment", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    await prisma.company.update({ where: { id: tenant.company.id }, data: { name: "مؤسسة النور", phone: "+967771234567" } });
    const s = await shipmentWithEvents(tenant, { status: "IN_TRANSIT", arrived: 0, events: ["في الطريق"] });

    await page.context().clearCookies();
    await page.goto(`/t/${s.trackingToken}`);

    const wa = page.getByRole("link", { name: /واتساب/ });
    await expect(wa).toBeVisible();
    const href = await wa.getAttribute("href");
    expect(href).toContain("https://wa.me/967771234567");
    // The customer should not have to retype a reference they are looking at.
    expect(decodeURIComponent(href!)).toContain(s.shipmentNumber);
    expect(decodeURIComponent(href!)).toContain("مؤسسة النور");
    // And it reads as a control, not as a disabled twin of the call button.
    await expect(wa).toHaveClass(/track-support-btn--whatsapp/);

    await cleanupTenant(tenant.company.id);
  });
});
