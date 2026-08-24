import { test, expect } from "@playwright/test";
import {
  prisma,
  createTestTenant,
  createTestShipment,
  createTestTrip,
  linkShipmentToTrip,
  login,
  cleanupTenant,
  visibleText,
} from "./helpers";

/**
 * TABLE & NAVIGATION IA — the third pass of the product review.
 *
 * Four claims, each a rule the audit committed to rather than a cosmetic tweak:
 *   1. the row is the control (a click anywhere on it opens the record, "⋯" still opens the menu)
 *   2. order lives in the URL, so a sorted list is linkable and survives a refresh
 *   3. a column that decides nothing is not a column
 *   4. a relation a human crosses daily is a link in both directions
 */

const DESKTOP = { width: 1440, height: 900 };

test.describe("The row is the control", () => {
  test("clicking anywhere on a shipment row opens it; the overflow menu still opens the menu", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 2,
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");

    // Clicking the ROW, not any link in it. The stretched pseudo-element covers the whole row, so
    // a click at its centre — over the route cell, which carries no link of its own — lands on the
    // shipment link. (Playwright refusing to click the route cell directly, with "intercepts
    // pointer events", is this feature working: something is genuinely covering that cell now.)
    await page.locator("table tbody tr", { hasText: shipment.shipmentNumber }).click();
    await expect(page).toHaveURL(new RegExp(`/app/shipments/${shipment.id}$`));

    // The overflow cell is positioned above the stretched link, so it is still its own control.
    await page.goto("/app/shipments");
    await page.getByRole("button", { name: "إجراءات الشحنة" }).first().click();
    await expect(page.getByRole("menuitem", { name: /نسخ رابط التتبع/ })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/shipments$/);

    await cleanupTenant(tenant.company.id);
  });

  test("a trip row opens the trip, and the driver cell opens the driver", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenant.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app/trips");

    // The driver's name sits above the row's stretched link, so it goes to the driver, not the trip.
    await page.getByRole("link", { name: "سائق اختبار" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/employees/${tenant.driverId}$`));

    await page.goto("/app/trips");
    await page.locator("table tbody tr", { hasText: trip.tripNumber }).click();
    await expect(page).toHaveURL(new RegExp(`/app/trips/${trip.id}$`));

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Order lives in the URL", () => {
  test("the date header flips the order, and the link is shareable", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const oldest = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 1,
    });
    const newest = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 1,
    });
    await prisma.shipment.update({
      where: { id: oldest.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");

    const firstNumber = () => page.locator("table tbody tr").first().locator("td").first().innerText();
    // Default: newest first, unchanged from before this existed.
    expect((await firstNumber()).trim()).toBe(newest.shipmentNumber);

    await page.getByRole("link", { name: /تاريخ الإنشاء/ }).click();
    await expect(page).toHaveURL(/dir=asc/);
    expect((await firstNumber()).trim()).toBe(oldest.shipmentNumber);

    // Linkable and refresh-proof — the whole reason the state is in the URL.
    await page.reload();
    expect((await firstNumber()).trim()).toBe(oldest.shipmentNumber);

    // Clicking the active column flips it back rather than turning sorting off.
    await page.getByRole("link", { name: /تاريخ الإنشاء/ }).click();
    await expect(page).not.toHaveURL(/dir=asc/);
    expect((await firstNumber()).trim()).toBe(newest.shipmentNumber);

    await cleanupTenant(tenant.company.id);
  });

  test("order survives a filter, and a nonsense direction falls back instead of breaking", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 1,
      status: "IN_TRANSIT",
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);

    await page.goto("/app/shipments?status=IN_TRANSIT&dir=asc");
    await page.getByRole("link", { name: /تاريخ الإنشاء/ }).click();
    // The filter rides along with the order rather than being dropped by it.
    await expect(page).toHaveURL(/status=IN_TRANSIT/);

    await page.goto("/app/shipments?dir=sideways");
    await expect(page.getByRole("link", { name: /تاريخ الإنشاء/ })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Columns and counters that decide nothing are gone", () => {
  test("the shipments list drops the lifetime total but keeps it in the header", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 1,
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");

    await expect(page.locator("text=إجمالي الشحنات")).toHaveCount(0);
    // The count that matters is still stated, on the heading itself.
    await expect(page.getByRole("heading", { name: /الشحنات \(1\)/ })).toBeVisible();
    // The four remaining counters are each a queue someone works.
    await expect(visibleText(page, "جاهزة للاستلام").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("the trips list states where the truck is instead of when the row was typed", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "صنعاء", "سيئون"]);
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenant.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
        { branchId: tenant.branches[2].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app/trips");

    await expect(page.locator("thead >> text=تاريخ الإنشاء")).toHaveCount(0);
    await expect(page.locator("thead >> text=الموقع")).toBeVisible();
    // Nothing has departed, so the truck reads as the first stop.
    const row = page.locator("table tbody tr", { hasText: trip.tripNumber });
    await expect(row).toContainText("فرع الرياض");

    // Once it leaves, the location follows it to the next stop.
    await prisma.tripStop.update({
      where: { id: trip.stops[0].id },
      data: { status: "DEPARTED", actualDeparture: new Date() },
    });
    await page.reload();
    await expect(page.locator("table tbody tr", { hasText: trip.tripNumber })).toContainText("فرع صنعاء");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Navigation says what things are", () => {
  test("documents leave the sidebar but stay reachable from the shipment that owns them", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 1,
    });

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app");

    await expect(page.locator('aside a[href="/app/documents"]')).toHaveCount(0);
    // Reports moved out of the finance group and into العمليات — it counts shipments, not money.
    await expect(page.locator('aside a[href="/app/reports"]')).toBeVisible();
    await expect(page.locator('aside a[href="/app/billing"]')).toBeVisible();

    // The archive is still a page, and still reachable from where its contents come from.
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.getByRole("tab", { name: /المرفقات/ }).click();
    await page.getByRole("link", { name: /عرض كل مستندات الشركة/ }).click();
    await expect(page).toHaveURL(/\/app\/documents$/);
    await expect(visibleText(page, "المستندات").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("the settings hub drops the strip that said the same thing forever", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض"]);
    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto("/app/settings");

    await expect(page.locator("text=جميع الإعدادات تقوم على مستوى الشركة")).toHaveCount(0);
    await expect(visibleText(page, "الفروع").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Driver and trip are linked both ways", () => {
  test("a driver's page lists their trips, and a non-driver has no such card", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id, cartonCount: 5,
      status: "READY_FOR_LOADING",
    });
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenant.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);

    await page.setViewportSize(DESKTOP);
    await login(page, tenant.adminEmail);
    await page.goto(`/app/employees/${tenant.driverId}`);

    await expect(visibleText(page, "رحلات السائق").first()).toBeVisible();
    await expect(visibleText(page, trip.tripNumber).first()).toBeVisible();
    // One shipment on the trip, five cartons in it — the load, not the trip's stop count.
    await expect(visibleText(page, "1 شحنة · 5 كرتون").first()).toBeVisible();

    // ...and back to the trip.
    await page.getByRole("link", { name: new RegExp(trip.tripNumber) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/trips/${trip.id}$`));
    // The trip page names the driver as a link now, not as prose in its subtitle.
    await page.getByRole("link", { name: "سائق اختبار" }).click();
    await expect(page).toHaveURL(new RegExp(`/app/employees/${tenant.driverId}$`));

    // An office employee is not a driver, so the card is absent rather than empty.
    const admin = await prisma.user.findFirstOrThrow({ where: { email: tenant.adminEmail } });
    await page.goto(`/app/employees/${admin.id}`);
    await expect(page.locator("text=رحلات السائق")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a role without trips.view sees no trips on a driver's page", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [{ branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false }],
    });

    const passwordHash = (await prisma.user.findFirstOrThrow({ where: { email: tenant.adminEmail } })).passwordHash;
    const role = await prisma.role.create({
      data: { companyId: tenant.company.id, name: `موارد بشرية ${Date.now()}`, permissions: JSON.stringify({ employees: ["view"] }) },
    });
    const email = `hr-${Date.now()}@test.local`;
    await prisma.user.create({
      data: { companyId: tenant.company.id, name: "موظف موارد", email, passwordHash, userType: "COMPANY_USER", roleId: role.id },
    });

    await login(page, email);
    await page.goto(`/app/employees/${tenant.driverId}`);
    await expect(visibleText(page, "سائق اختبار").first()).toBeVisible();
    await expect(page.locator("text=رحلات السائق")).toHaveCount(0);
    await expect(page.locator(`text=${trip.tripNumber}`)).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });
});
