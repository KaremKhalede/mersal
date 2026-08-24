import { test, expect, type Page } from "@playwright/test";
import { createTestTenant, cleanupTenant, login, createTestShipment, prisma } from "./helpers";

/**
 * One rule for row actions, across every list.
 *
 * The six list pages answered "what can I do with this row?" three different ways: two bare ghost
 * icons on shipments, a "⋯" menu on customers/employees/vehicles/branches, and five labelled
 * buttons on the delivery queue. That is the clearest "built one page at a time" tell in the
 * product, and it is the kind of thing a user feels as *this app is inconsistent* long before they
 * could name it.
 *
 * The rule they now share is deliberately not "everything becomes a ⋯" — that would bury the
 * delivery queue's next workflow step, which has to stay a visible button for exactly the reason
 * the shipment page's primary does:
 *
 *   the one next step in the workflow stays a button; navigation, secondary and destructive go in ⋯
 */

const menuTrigger = (page: Page) => page.locator('[data-slot="dropdown-menu-trigger"]');

test.describe("row actions follow one rule", () => {
  test("a shipments row offers a menu, not loose icons", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    await createTestShipment({
      companyId: t.company.id, customerId: t.customerId, loadBranchId: a.id, unloadBranchId: b.id,
      cartonCount: 3, status: "IN_TRANSIT",
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, t.adminEmail);
    await page.goto("/app/shipments");
    await page.locator("table").waitFor();

    const row = page.locator("tbody tr").first();
    await row.getByRole("button", { name: "إجراءات الشحنة" }).click();

    // Everything the two icons offered, plus the action that used to require opening the shipment.
    await expect(page.getByRole("menuitem", { name: "عرض التفاصيل" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "طباعة الملصقات" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "نسخ رابط التتبع" })).toBeVisible();
    await page.keyboard.press("Escape");

    // The shipment number was always the real link to the record; the eye icon duplicated it.
    await expect(row.getByRole("link").first()).toHaveAttribute("href", /\/app\/shipments\//);

    await cleanupTenant(t.company.id);
  });

  test("the delivery queue keeps its next step visible and buries the destructive one", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    const s = await createTestShipment({
      companyId: t.company.id, customerId: t.customerId, loadBranchId: a.id, unloadBranchId: b.id,
      cartonCount: 4, status: "READY_FOR_PICKUP",
    });
    await prisma.deliveryRequest.create({
      data: {
        companyId: t.company.id, shipmentId: s.id, pickupBranchId: b.id,
        customerName: "أحمد الشامي", customerPhone: "+967771112222",
        destinationAddress: "حي السلام، صنعاء", cartonCount: 4, status: "PENDING",
      },
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, t.adminEmail);
    await page.goto("/app/delivery");
    await page.locator("table").waitFor();

    // The workflow's next step stays a real button — burying it would defeat the queue.
    await expect(page.getByRole("button", { name: /مراجعة وتأكيد الطلب/ })).toBeVisible();
    // The destructive one is no longer a peer of it.
    await expect(page.getByRole("button", { name: /إلغاء الطلب/ })).toHaveCount(0);

    await page.getByRole("button", { name: "إجراءات أخرى" }).click();
    await expect(page.getByRole("menuitem", { name: /إلغاء الطلب/ })).toBeVisible();

    await cleanupTenant(t.company.id);
  });

  test("every list row exposes its actions through the same trigger", async ({ page }) => {
    const t = await createTestTenant();
    const [a, b] = t.branches;
    await createTestShipment({
      companyId: t.company.id, customerId: t.customerId, loadBranchId: a.id, unloadBranchId: b.id,
      cartonCount: 2, status: "IN_TRANSIT",
    });
    await prisma.vehicle.create({ data: { companyId: t.company.id, plateNumber: "ABC-1", type: "TRUCK" } });

    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, t.adminEmail);
    for (const url of ["/app/shipments", "/app/customers", "/app/vehicles", "/app/branches"]) {
      await page.goto(url);
      await page.locator("table").waitFor();
      expect(await menuTrigger(page).count(), `${url} must use the shared menu trigger`).toBeGreaterThan(0);
    }
    await cleanupTenant(t.company.id);
  });

  test("a truncated list says how much it is hiding", async ({ page }) => {
    const t = await createTestTenant();
    // 105 notification rows against a 100-row cap.
    await prisma.notificationLog.createMany({
      data: Array.from({ length: 105 }, () => ({
        companyId: t.company.id, event: "SHIPMENT_RECEIVED", recipient: "SENDER",
        toPhone: "+967700000000", message: "x", status: "SENT",
      })),
    });

    await login(page, t.adminEmail);
    await page.goto("/app/notifications");
    await page.getByRole("tab", { name: /سجل الإرسال/ }).click();

    // It used to show 100 rows and claim nothing about the other 5.
    await expect(page.locator("text=/يعرض أحدث 100 رسالة من أصل 105/")).toBeVisible();

    await cleanupTenant(t.company.id);
  });
});
