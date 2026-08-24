import { test, expect } from "@playwright/test";
import {
  prisma,
  createTestTenant,
  createTestShipment,
  createTestTrip,
  linkShipmentToTrip,
  login,
  cleanupTenant,
  pollUntil,
  visibleText,
} from "./helpers";
// Statically imported, not `await import()`: the "@/..." alias inside the action is resolved at
// build time, so a runtime dynamic import of it fails to find the module.
import { lookupShipmentAction } from "../../src/app/track/actions";

/**
 * BRANCH CONTACT — the column two screens were already working around.
 *
 * The public tracking page told a customer collecting from a branch to ring the COMPANY, and said
 * so in its own comment ("no address or phone column exists on it"); the driver's call button had
 * nothing branch-specific to dial either. Both now reach the branch, and both still fall back to
 * head office — which is not dead code, because every branch that existed before this migration
 * has NULL in both columns.
 */

async function branchWithContact(companyId: string, branchId: string) {
  return prisma.branch.update({
    where: { id: branchId },
    data: { phone: "+967711223344", address: "شارع الستين، أمام مسجد النور" },
  });
}

test.describe("Recording a branch's own contact", () => {
  test("an office adds and edits the two fields, and they show on the branch", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض"]);

    await login(page, tenant.adminEmail);
    await page.goto("/app/branches");

    await page.getByRole("button", { name: /فرع جديد/ }).click();
    await page.fill('input[name="name"]', "فرع سيئون");
    await page.fill('input[name="city"]', "سيئون");
    await page.fill('input[name="country"]', "اليمن");
    await page.fill('input[name="phone"]', "+967711223344");
    await page.fill('input[name="address"]', "شارع الستين");
    await page.getByRole("button", { name: /حفظ|إضافة|إنشاء/ }).last().click();

    const created = await pollUntil(
      () => prisma.branch.findFirst({ where: { companyId: tenant.company.id, name: "فرع سيئون" } }),
      (b) => b !== null
    );
    // Stored normalised, so the tel: links built from it are dialable.
    expect(created!.phone).toBe("+967711223344");
    expect(created!.address).toBe("شارع الستين");

    await page.goto(`/app/branches/${created!.id}`);
    await expect(visibleText(page, "التواصل مع الفرع").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /967 711 223 344/ })).toHaveAttribute("href", "tel:+967711223344");
    await expect(visibleText(page, "شارع الستين").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("both fields are optional, and a branch without them shows no empty contact card", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض"]);

    await login(page, tenant.adminEmail);
    await page.goto("/app/branches");
    await page.getByRole("button", { name: /فرع جديد/ }).click();
    await page.fill('input[name="name"]', "فرع بلا هاتف");
    await page.fill('input[name="city"]', "عدن");
    await page.fill('input[name="country"]', "اليمن");
    await page.getByRole("button", { name: /حفظ|إضافة|إنشاء/ }).last().click();

    const created = await pollUntil(
      () => prisma.branch.findFirst({ where: { companyId: tenant.company.id, name: "فرع بلا هاتف" } }),
      (b) => b !== null
    );
    // NULL, not "" — every consumer tests the value itself rather than re-deciding what blank means.
    expect(created!.phone).toBeNull();
    expect(created!.address).toBeNull();

    await page.goto(`/app/branches/${created!.id}`);
    await expect(page.locator("text=التواصل مع الفرع")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a malformed branch number is refused rather than stored unusable", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض"]);

    await login(page, tenant.adminEmail);
    await page.goto("/app/branches");
    await page.getByRole("button", { name: /فرع جديد/ }).click();
    await page.fill('input[name="name"]', "فرع رقم خاطئ");
    await page.fill('input[name="city"]', "تعز");
    await page.fill('input[name="country"]', "اليمن");
    await page.fill('input[name="phone"]', "123");
    await page.getByRole("button", { name: /حفظ|إضافة|إنشاء/ }).last().click();

    // A branch must not be the one place in the product where an unreachable number is accepted.
    await expect(visibleText(page, "رقم هاتف الفرع").first()).toBeVisible();
    const created = await prisma.branch.findFirst({ where: { companyId: tenant.company.id, name: "فرع رقم خاطئ" } });
    expect(created).toBeNull();

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("The customer reaches the shelf, not head office", () => {
  test("the tracking page offers the pickup branch's own number and address", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await prisma.company.update({ where: { id: tenant.company.id }, data: { phone: "+967700000001" } });
    await branchWithContact(tenant.company.id, tenant.branches[1].id);

    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id,
      cartonCount: 2, status: "ARRIVED",
    });
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });

    await page.context().clearCookies();
    await page.goto(`/t/${trackingToken}`);

    await expect(visibleText(page, "الاستلام من").first()).toBeVisible();
    // The branch's address replaces the bare city, and its number replaces the switchboard.
    await expect(visibleText(page, "شارع الستين، أمام مسجد النور").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /967 711 223 344/ })).toHaveAttribute("href", "tel:+967711223344");
    await expect(page.locator("text=967 700 000 001")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a branch with no number of its own still gives the customer the company's", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await prisma.company.update({ where: { id: tenant.company.id }, data: { phone: "+967700000001" } });

    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id,
      cartonCount: 2, status: "ARRIVED",
    });
    const { trackingToken } = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });

    await page.context().clearCookies();
    await page.goto(`/t/${trackingToken}`);
    // The fallback is the state of every branch created before the migration, so it is the common
    // path on day one, not an edge case.
    await expect(page.getByRole("link", { name: /967 700 000 001/ })).toBeVisible();
    await expect(visibleText(page, "فرع سيئون").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("the branch's contact never leaks into the public lookup payload beyond what it renders", async () => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await branchWithContact(tenant.company.id, tenant.branches[1].id);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id,
      cartonCount: 1, status: "ARRIVED", receiverPhone: "+967700114567",
    });

    const fd = new FormData();
    fd.set("shipmentNumber", shipment.shipmentNumber);
    fd.set("last4", "4567");
    const result = await lookupShipmentAction(fd);
    expect("shipment" in result).toBe(true);

    const payload = JSON.stringify(result);
    // The pickup branch's contact is meant to be public — it is printed on the page. The ORIGIN
    // branch's is not, and the view model must not have quietly started carrying it.
    expect(payload).toContain("+967711223344");
    const origin = await prisma.branch.update({
      where: { id: tenant.branches[0].id },
      data: { phone: "+967799999999" },
    });
    const second = await lookupShipmentAction(fd);
    expect(JSON.stringify(second)).not.toContain(origin.phone!);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("The driver calls the branch they are standing at", () => {
  test("the button dials the current stop's branch, and names it", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    await prisma.company.update({ where: { id: tenant.company.id }, data: { phone: "+967700000001" } });
    await branchWithContact(tenant.company.id, tenant.branches[0].id);

    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id,
      cartonCount: 2, status: "READY_FOR_LOADING",
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

    await login(page, tenant.driverEmail);
    await page.goto("/driver");

    const call = page.getByRole("link", { name: /اتصال بـفرع الرياض/ });
    await expect(call).toBeVisible();
    await expect(call).toHaveAttribute("href", "tel:+967711223344");

    // Move the truck on: the button follows it to the next branch, which has no number of its own,
    // so it falls back to head office and says so.
    await prisma.tripStop.update({
      where: { id: trip.stops[0].id },
      data: { status: "DEPARTED", actualDeparture: new Date() },
    });
    await page.reload();
    const fallback = page.getByRole("link", { name: /اتصال بالمكتب/ });
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("href", "tel:+967700000001");

    await cleanupTenant(tenant.company.id);
  });

  test("no number anywhere means no dead button", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "سيئون"]);
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id, unloadBranchId: tenant.branches[1].id,
      cartonCount: 1, status: "READY_FOR_LOADING",
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

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(page.locator("text=اتصال ب")).toHaveCount(0);
    await expect(visibleText(page, "الإبلاغ عن مشكلة").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
