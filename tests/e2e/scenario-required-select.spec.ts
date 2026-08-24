import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";
import {
  createTestTenant, cleanupTenant, login, createTestShipment, createTestTrip, linkShipmentToTrip, prisma, TEST_PASSWORD,
} from "./helpers";

/**
 * A dropdown left on its placeholder must say so.
 *
 * Radix's <Select> keeps the value in a hidden `<select required tabindex="-1" aria-hidden="true">`
 * proxy so it reaches FormData. Chrome cannot focus an aria-hidden control, so when constraint
 * validation found it empty it refused to submit, logged "An invalid form control ... is not
 * focusable" to a console nobody in a shipping office is reading, and showed the user nothing:
 * pressing حفظ did nothing at all, with no message, no spinner and no error. Six forms behaved this
 * way, including the highest-volume one in the product.
 *
 * `required` is off those six now. Every one of their actions was already validating the same field
 * server-side with an Arabic message, and FormDialog already turns a returned `{ error }` into a
 * toast — that path was simply unreachable while the browser blocked the submit first.
 *
 * So the contract each case below asserts is the same four things: the save is still refused, the
 * user is told why in Arabic, nothing is written to the console about an unfocusable control, and
 * whatever they already typed is still there to correct.
 */

/** Fails the test on the specific console error this change exists to eliminate. */
function watchConsole(page: Page) {
  const offenders: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    const t = m.text();
    if (/not focusable|invalid form control/i.test(t)) offenders.push(t);
  });
  return offenders;
}

const toast = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

test.describe("a required dropdown left unchosen explains itself", () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  test.beforeAll(async () => {
    tenant = await createTestTenant();
  });
  test.afterAll(async () => {
    await cleanupTenant(tenant.company.id);
  });

  test("New Shipment without a loading branch", async ({ page }) => {
    const offenders = watchConsole(page);
    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");
    await page.getByRole("button", { name: "شحنة جديدة" }).first().click();

    await page.fill("#customerName", "عميل الاختبار");
    await page.fill("#customerPhone", "771234567");
    // Destination chosen, origin deliberately left on its placeholder.
    await page.locator('[data-slot="dialog-body"]').getByRole("combobox").nth(1).click();
    await page.getByRole("option", { name: tenant.branches[1].name }).click();

    await page.getByRole("button", { name: "حفظ" }).click();

    await expect(toast(page, "اختر فرع التحميل (المنشأ)")).toBeVisible();
    await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible(); // refused, still open
    await expect(page.locator("#customerName")).toHaveValue("عميل الاختبار"); // nothing lost
    expect(offenders).toEqual([]);
    expect(await prisma.shipment.count({ where: { companyId: tenant.company.id } })).toBe(0);
  });

  test("New Shipment without an unloading branch", async ({ page }) => {
    const offenders = watchConsole(page);
    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");
    await page.getByRole("button", { name: "شحنة جديدة" }).first().click();

    await page.fill("#customerName", "عميل الاختبار");
    await page.fill("#customerPhone", "771234567");
    await page.fill("#goodsType", "أثاث");
    await page.locator('[data-slot="dialog-body"]').getByRole("combobox").first().click();
    await page.getByRole("option", { name: tenant.branches[0].name }).click();

    await page.getByRole("button", { name: "حفظ" }).click();

    await expect(toast(page, "اختر فرع التفريغ (الوجهة)")).toBeVisible();
    await expect(page.locator("#goodsType")).toHaveValue("أثاث");
    expect(offenders).toEqual([]);
    expect(await prisma.shipment.count({ where: { companyId: tenant.company.id } })).toBe(0);
  });

  test("Employee without a role", async ({ page }) => {
    const offenders = watchConsole(page);
    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");
    const before = await prisma.user.count({ where: { companyId: tenant.company.id } });

    await page.getByRole("button", { name: "موظف جديد" }).first().click();
    await page.fill("#name", "موظف بلا دور");
    await page.fill("#email", "no-role@test.local");
    await page.fill("#phone", "771234567");
    await page.fill("#password", TEST_PASSWORD);
    await page.fill("#passwordConfirm", TEST_PASSWORD);

    await page.getByRole("button", { name: "حفظ الموظف" }).click();

    await expect(toast(page, "الدور الوظيفي مطلوب")).toBeVisible();
    await expect(page.locator("#name")).toHaveValue("موظف بلا دور");
    expect(offenders).toEqual([]);
    expect(await prisma.user.count({ where: { companyId: tenant.company.id } })).toBe(before);
  });

  test("Vehicle without a type", async ({ page }) => {
    const offenders = watchConsole(page);
    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");

    await page.getByRole("button", { name: "مركبة جديدة" }).first().click();
    await page.fill("#plateNumber", "ABC-1234");
    await page.getByRole("button", { name: "حفظ المركبة" }).click();

    await expect(toast(page, "نوع المركبة مطلوب")).toBeVisible();
    await expect(page.locator("#plateNumber")).toHaveValue("ABC-1234");
    expect(offenders).toEqual([]);
    expect(await prisma.vehicle.count({ where: { companyId: tenant.company.id } })).toBe(0);
  });

  test("Trip without a stop branch", async ({ page }) => {
    const offenders = watchConsole(page);
    await login(page, tenant.adminEmail);
    await page.goto("/app/trips/new");
    const before = await prisma.trip.count({ where: { companyId: tenant.company.id } });

    // Both default stop rows exist; neither branch is chosen.
    await page.getByRole("button", { name: /إنشاء الرحلة|حفظ/ }).first().click();

    await expect(toast(page, "اختر فرعاً لكل محطة في الرحلة")).toBeVisible();
    expect(offenders).toEqual([]);
    expect(await prisma.trip.count({ where: { companyId: tenant.company.id } })).toBe(before);
  });

  test("Driver problem report without a shipment", async ({ page }) => {
    const offenders = watchConsole(page);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id,
      cartonCount: 3, status: "IN_TRANSIT",
    });
    const trip = await createTestTrip({
      companyId: tenant.company.id, driverId: tenant.driverId,
      stops: [
        { branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenant.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
    await prisma.tripShipmentStop.updateMany({ where: { tripId: trip.id }, data: { loadedAt: new Date() } });

    await page.setViewportSize({ width: 390, height: 844 }); // the driver's actual screen
    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}/report-problem`);

    await page.fill('textarea[name="note"]', "ملاحظة السائق");
    await page.getByRole("button", { name: /إرسال|إبلاغ/ }).first().click();

    // Specifically NOT "هذه الشحنة ليست ضمن رحلتك" — that reads as a permission refusal for what is
    // only an unfilled field, and is what the action said before shipmentId stopped being "null".
    await expect(toast(page, "اختر الشحنة المراد الإبلاغ عنها")).toBeVisible();
    await expect(page.locator('textarea[name="note"]')).toHaveValue("ملاحظة السائق");
    expect(offenders).toEqual([]);
    expect(await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).toMatchObject({
      status: "IN_TRANSIT", // untouched
    });
  });

  test("the happy path still saves", async ({ page }) => {
    // Removing `required` must not remove the ability to submit — the guard is the server's now.
    const offenders = watchConsole(page);
    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");

    await page.getByRole("button", { name: "مركبة جديدة" }).first().click();
    await page.fill("#plateNumber", "OK-9999");
    await page.getByRole("combobox").last().click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "حفظ المركبة" }).click();

    await expect(page.locator('[data-slot="dialog-content"]')).toBeHidden();
    expect(offenders).toEqual([]);
    expect(await prisma.vehicle.count({ where: { companyId: tenant.company.id, plateNumber: "OK-9999" } })).toBe(1);
  });
});
