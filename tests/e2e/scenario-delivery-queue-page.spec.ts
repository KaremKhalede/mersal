import { test, expect, type Page } from "@playwright/test";
import { createTestTenant, cleanupTenant, login, createTestShipment, prisma } from "./helpers";

/**
 * The delivery queue, and the notifications centre, as working screens rather than read-only ones.
 *
 * The queue was the page that most obviously came from a different afternoon than its neighbours:
 * a bare table with no counters, no search, no status filter and no designed empty state, one nav
 * item below a shipments list that had all four.
 *
 * The notifications centre had the opposite problem — it stated a reason and offered nothing. Every
 * SKIPPED row showed "لا يوجد رقم جوال للمستلم" next to an empty action cell, which is information
 * about a problem with no route to fixing it.
 */

async function seedRequest(companyId: string, customerId: string, a: string, b: string, status: string, name: string) {
  const s = await createTestShipment({
    companyId, customerId, loadBranchId: a, unloadBranchId: b, cartonCount: 4, status: "READY_FOR_PICKUP",
  });
  await prisma.deliveryRequest.create({
    data: {
      companyId, shipmentId: s.id, pickupBranchId: b, customerName: name,
      customerPhone: "+967771112222", destinationAddress: `حي السلام، شارع الستين، بجوار مسجد النور، ${name}`,
      cartonCount: 4, status,
    },
  });
  return s;
}

// "قيد الانتظار" is deliberately the same wording as the status badge and the filter option — a
// counter should name the state it counts. So the assertion scopes to the counters row rather
// than renaming the label to make the test easier.
const counts = (page: Page) => page.getByTestId("delivery-counts");

test.describe("delivery queue page", () => {
  test("the queue counts what is waiting, and can be searched and filtered", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    await seedRequest(t.company.id, t.customerId, a.id, b.id, "PENDING", "أحمد");
    await seedRequest(t.company.id, t.customerId, a.id, b.id, "PENDING", "سالم");
    await seedRequest(t.company.id, t.customerId, a.id, b.id, "OUT_FOR_DELIVERY", "خالد");

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, t.adminEmail);
    await page.goto("/app/delivery");
    await page.locator("table").waitFor();

    // counters the queue exists to answer
    const pendingCard = counts(page).locator("> div").first();
    await expect(pendingCard).toContainText("قيد الانتظار");
    await expect(pendingCard).toContainText("2");
    await expect(page.locator("tbody tr")).toHaveCount(3);

    // search — by receiver name.
    // Scoped to <main>: the topbar's global search field is also name="q" (different form, different
    // destination), so an unscoped selector types into the wrong box and the filter submits empty.
    await page.locator('main form input[name="q"]').fill("خالد");
    await page.getByRole("button", { name: "تصفية" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody")).toContainText("خالد");

    // filter — by status
    await page.goto("/app/delivery?status=PENDING");
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // a filter that matches nothing offers the way out, not the first-run message
    await page.goto("/app/delivery?q=لا-يوجد-شيء-بهذا-الاسم");
    await expect(page.locator("text=مسح الفلاتر")).toBeVisible();
    await expect(page.locator("text=يطلب العميل التوصيل")).toHaveCount(0);

    await cleanupTenant(t.company.id);
  });

  test("an empty queue explains where requests come from instead of offering a button it cannot have", async ({ page }) => {
    const t = await createTestTenant();
    await login(page, t.adminEmail);
    await page.goto("/app/delivery");
    // A delivery request is raised by the customer on their tracking page — never by an employee
    // here — so the empty state teaches rather than offering a create action that cannot exist.
    await expect(page.locator("text=لا توجد طلبات توصيل")).toBeVisible();
    await expect(page.locator("text=يطلب العميل التوصيل من صفحة تتبع شحنته")).toBeVisible();
    await cleanupTenant(t.company.id);
  });

  test("a long address wraps instead of pushing the action column off the card", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    await seedRequest(t.company.id, t.customerId, a.id, b.id, "PENDING", "أحمد");

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, t.adminEmail);
    await page.goto("/app/delivery");
    await page.locator("table").waitFor();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    // the queue's next step is reachable, not scrolled off
    await expect(page.getByRole("button", { name: /مراجعة وتأكيد الطلب/ })).toBeInViewport();

    await cleanupTenant(t.company.id);
  });
});

test.describe("notifications centre", () => {
  test("a skipped message offers the fix its own reason implies", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    const s = await createTestShipment({
      companyId: t.company.id, customerId: t.customerId, loadBranchId: a.id, unloadBranchId: b.id,
      cartonCount: 2, status: "ARRIVED",
    });
    await prisma.notificationLog.create({
      data: {
        companyId: t.company.id, shipmentId: s.id, event: "SHIPMENT_ARRIVED", recipient: "RECEIVER",
        toPhone: "", message: "وصلت شحنتك", status: "SKIPPED",
        providerError: "no phone number on file for receiver",
      },
    });

    await login(page, t.adminEmail);
    await page.goto("/app/notifications");

    // the reason, in Arabic, as before
    await expect(page.locator("text=لا يوجد رقم جوال للمستلم")).toBeVisible();
    // and now a route to acting on it — the action cell used to be blank
    const fix = page.getByRole("link", { name: /تصحيح البيانات/ });
    await expect(fix).toBeVisible();
    await fix.click();
    await expect(page).toHaveURL(new RegExp(`/app/shipments/${s.id}`));

    await cleanupTenant(t.company.id);
  });

  test("an empty notifications centre reads as good news, not as a blank table", async ({ page }) => {
    const t = await createTestTenant();
    await login(page, t.adminEmail);
    await page.goto("/app/notifications");
    await expect(page.locator("text=كل الرسائل وصلت")).toBeVisible();
    await cleanupTenant(t.company.id);
  });
});
