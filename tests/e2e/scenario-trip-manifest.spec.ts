import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, createBranchScopedUser, login, cleanupTenant, expectNotFound } from "./helpers";

/** كشف حمولة الرحلة — generated read-only from the trip and its linked shipments, no stored fields. */
test.describe("Scenario — trip manifest (كشف حمولة الرحلة)", () => {
  test("shows correct trip data, summary totals, and shipment rows — no financial fields", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [branchA, branchB] = tenant.branches;

    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "ب ج د 1234", type: "TRUCK" } });
    await prisma.user.update({ where: { id: tenant.driverId }, data: { phone: "+966501234567" } });

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      vehicleId: vehicle.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const shipment1 = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 2 });
    await prisma.shipment.update({ where: { id: shipment1.id }, data: { weightKg: 10, goodsType: "مواد غذائية", shippingPrice: 500, amountPaid: 200 } });
    const shipment2 = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 3 });
    await prisma.shipment.update({ where: { id: shipment2.id }, data: { weightKg: 15, shippingPrice: 800 } });
    await linkShipmentToTrip(trip.id, shipment1.id, trip.stops[0].id, trip.stops[1].id);
    await linkShipmentToTrip(trip.id, shipment2.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.adminEmail);

    await page.goto(`/app/trips/${trip.id}`);
    const manifestLink = page.locator('a:has-text("كشف الحمولة")');
    await expect(manifestLink).toHaveAttribute("href", `/app/trips/${trip.id}/manifest`);
    await manifestLink.click();
    await page.waitForURL(`**/app/trips/${trip.id}/manifest`);

    // Trip data
    await expect(page.locator(`text=${trip.tripNumber}`).first()).toBeVisible();
    await expect(page.locator("text=سائق اختبار").first()).toBeVisible();
    await expect(page.locator("text=+966501234567")).toBeVisible();
    await expect(page.locator("text=ب ج د 1234")).toBeVisible();
    await expect(page.locator("text=شاحنة").first()).toBeVisible();
    await expect(page.locator(`text=${branchA.name}`).first()).toBeVisible();
    await expect(page.locator(`text=${branchB.name}`).first()).toBeVisible();
    await expect(page.locator("text=بري")).toBeVisible();

    // Summary — computed from linked shipments, not user-entered
    await expect(page.locator("text=2").first()).toBeVisible(); // shipments count region sanity
    const summarySection = page.locator("text=ملخص الرحلة").locator("..");
    await expect(summarySection.getByText("5", { exact: true })).toBeVisible(); // 2 + 3 cartons
    await expect(summarySection.getByText("25 كجم", { exact: true })).toBeVisible(); // 10 + 15 kg

    // Shipment rows — only the two linked shipments, right columns
    await expect(page.locator(`text=${shipment1.shipmentNumber}`)).toBeVisible();
    await expect(page.locator(`text=${shipment2.shipmentNumber}`)).toBeVisible();
    await expect(page.locator("text=مستلم اختبار").first()).toBeVisible();
    await expect(page.locator("text=مواد غذائية")).toBeVisible();

    // No financial data anywhere on the manifest — checked by label rather than raw digits, since
    // shipment/trip numbers are timestamp-derived and could otherwise coincidentally contain the
    // same digits as a price (e.g. "...800...").
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/المبلغ المدفوع|المتبقي|طريقة الدفع|أجرة الشحن|ر\.ي/);

    await cleanupTenant(tenant.company.id);
  });

  test("total weight only shown when every linked shipment has a weight recorded", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const shipment1 = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1 });
    await prisma.shipment.update({ where: { id: shipment1.id }, data: { weightKg: 10 } });
    const shipment2 = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1 });
    // shipment2 has no weightKg
    await linkShipmentToTrip(trip.id, shipment1.id, trip.stops[0].id, trip.stops[1].id);
    await linkShipmentToTrip(trip.id, shipment2.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}/manifest`);
    await expect(page.locator("text=غير متوفر")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("adding a shipment to the trip makes it appear on the manifest; removing it makes it disappear", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 4 });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}/manifest`);
    await expect(page.locator(`text=${shipment.shipmentNumber}`)).toHaveCount(0);
    await expect(page.locator("text=لا توجد شحنات مرتبطة بهذه الرحلة بعد")).toBeVisible();

    const link = await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
    await page.reload();
    await expect(page.locator(`text=${shipment.shipmentNumber}`)).toBeVisible();

    await prisma.tripShipmentStop.delete({ where: { id: link.id } });
    await page.reload();
    await expect(page.locator(`text=${shipment.shipmentNumber}`)).toHaveCount(0);
    await expect(page.locator("text=لا توجد شحنات مرتبطة بهذه الرحلة بعد")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("cannot view another company's trip manifest (company isolation)", async ({ page }) => {
    const tenantA = await createTestTenant(["أ", "ب"]);
    const tenantB = await createTestTenant(["ج", "د"]);
    const trip = await createTestTrip({
      companyId: tenantB.company.id,
      stops: [
        { branchId: tenantB.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenantB.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    await login(page, tenantA.adminEmail);
    await page.goto(`/app/trips/${trip.id}/manifest`);
    await expectNotFound(page, [trip.tripNumber]);

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });

  test("a Branch Employee outside the trip's route cannot reach its manifest (branch scoping)", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchB.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const employeeAtA = await createBranchScopedUser({ companyId: tenant.company.id, branchId: branchA.id, permissions: { trips: ["view"] } });

    await login(page, employeeAtA.email);
    await page.goto(`/app/trips/${trip.id}/manifest`);
    await expectNotFound(page, [trip.tripNumber]);

    await cleanupTenant(tenant.company.id);
  });

  test("a role without trips.view cannot reach the manifest page", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const employee = await createBranchScopedUser({ companyId: tenant.company.id, branchId: branchA.id, permissions: { shipments: ["view"] } });

    await login(page, employee.email);
    await page.goto(`/app/trips/${trip.id}/manifest`);
    await expect(page).toHaveURL(/\/app$/);

    await cleanupTenant(tenant.company.id);
  });

  test("print controls are screen-only and the manifest renders on a small viewport", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1 });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.adminEmail);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/app/trips/${trip.id}/manifest`);
    await expect(page.locator('button:has-text("طباعة كشف الحمولة")')).toBeVisible();
    await expect(page.locator('a:has-text("رجوع إلى الرحلة")')).toBeVisible();
    await expect(page.locator(`text=${shipment.shipmentNumber}`)).toBeVisible();
    const printOnlyRow = page.locator('div.print\\:hidden', { hasText: "رجوع إلى الرحلة" });
    await expect(printOnlyRow).toHaveClass(/print:hidden/);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.reload();
    await expect(page.locator(`text=${shipment.shipmentNumber}`)).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
