import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  prisma,
  createTestTenant,
  createTestShipment,
  createTestTrip,
  createBranchScopedUser,
  login,
  cleanupTenant,
  TEST_PASSWORD,
  expectNotFound,
} from "./helpers";

test.describe("Scenario P — branch-level data access (Phase 5 P0)", () => {
  test("a Branch Employee sees only shipments/trips/customers touching their own branch", async ({ page }) => {
    const tenant = await createTestTenant(["فرع أ", "فرع ب", "فرع ج"]);
    const [branchA, branchB, branchC] = tenant.branches;

    // Shipment that touches branch A (visible to the A-scoped employee)
    const shipmentAtA = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: branchA.id,
      unloadBranchId: branchC.id,
      cartonCount: 2,
    });
    // Shipment that never touches branch A at all (must stay invisible)
    const shipmentAtB = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: branchB.id,
      unloadBranchId: branchC.id,
      cartonCount: 3,
    });

    const tripAtA = await createTestTrip({
      companyId: tenant.company.id,
      stops: [{ branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false }, { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true }],
    });
    const tripAtB = await createTestTrip({
      companyId: tenant.company.id,
      stops: [{ branchId: branchB.id, loadingEnabled: true, unloadingEnabled: false }, { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true }],
    });

    const customerAtHomeA = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل فرع أ", phone: "+966500000001", homeBranchId: branchA.id },
    });
    const customerAtHomeB = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل فرع ب", phone: "+966500000002", homeBranchId: branchB.id },
    });

    const branchEmployee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { shipments: ["view", "updateStatus"], trips: ["view"], customers: ["view"], customs: ["view"], documents: ["view"] },
    });

    await login(page, branchEmployee.email);

    // Shipments list: A-touching shipment visible, B-only shipment is not
    await page.goto("/app/shipments");
    await expect(page.locator(`text=${shipmentAtA.shipmentNumber}`)).toBeVisible();
    await expect(page.locator(`text=${shipmentAtB.shipmentNumber}`)).toHaveCount(0);

    // Shipment detail: a direct URL to the out-of-branch shipment must refuse and leak nothing.
    await page.goto(`/app/shipments/${shipmentAtB.id}`);
    await expectNotFound(page, [shipmentAtB.shipmentNumber]);
    await page.goto(`/app/shipments/${shipmentAtA.id}`);
    await expect(page.locator(`text=${shipmentAtA.shipmentNumber}`)).toBeVisible();

    // Trips list: only the trip whose stops include branch A
    await page.goto("/app/trips");
    await expect(page.locator(`text=${tripAtA.tripNumber}`)).toBeVisible();
    await expect(page.locator(`text=${tripAtB.tripNumber}`)).toHaveCount(0);
    await page.goto(`/app/trips/${tripAtB.id}`);
    await expectNotFound(page, [tripAtB.tripNumber]);

    // Customers: home-branch-A customer visible, home-branch-B customer is not
    await page.goto("/app/customers");
    await expect(page.locator(`text=${customerAtHomeA.name}`)).toBeVisible();
    await expect(page.locator(`text=${customerAtHomeB.name}`)).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a customer with no home branch is still visible to the branch that actually shipped for them", async ({ page }) => {
    const tenant = await createTestTenant(["فرع أ", "فرع ب"]);
    const [branchA, branchB] = tenant.branches;

    // No homeBranchId set — same as findOrCreateCustomer's default when a shipment is created
    // through the normal UI flow.
    const walkInCustomer = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل بلا فرع أساسي", phone: "+966500000009" },
    });
    await createTestShipment({ companyId: tenant.company.id, customerId: walkInCustomer.id, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1 });

    const branchEmployee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { shipments: ["view"], customers: ["view"] },
    });

    await login(page, branchEmployee.email);
    await page.goto("/app/customers");
    await expect(page.locator(`text=${walkInCustomer.name}`)).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("Company Admin still sees every branch's shipments and trips (company-wide, not restricted)", async ({ page }) => {
    const tenant = await createTestTenant(["فرع أ", "فرع ب"]);
    const [branchA, branchB] = tenant.branches;

    const shipmentAtA = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchA.id, cartonCount: 1 });
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchB.id, cartonCount: 1 });

    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");
    await expect(page.locator(`text=${shipmentAtA.shipmentNumber}`)).toBeVisible();
    await expect(page.locator(`text=${shipmentAtB.shipmentNumber}`)).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a company-wide role with no branch assigned still sees every branch (branch scoping only kicks in once a branch is set)", async ({ page }) => {
    // Matches how the seed/RBAC data model actually distinguishes the two: "موظف فرع"/"مدير عمليات"
    // both carry a branchId (branch-scoped), while a company-wide role (accountant, auditor, ...)
    // simply has none — branch restriction is additive on top of RBAC's own permission checks, not
    // a re-interpretation of every non-admin role as branch-tied.
    const tenant = await createTestTenant(["فرع أ", "فرع ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipmentAtA = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchA.id, cartonCount: 1 });
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchB.id, cartonCount: 1 });

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const role = await prisma.role.create({
      data: { companyId: tenant.company.id, name: "محاسب", permissions: JSON.stringify({ shipments: ["view"] }) },
    });
    const email = `no-branch-${Date.now()}@test.local`;
    await prisma.user.create({
      data: { companyId: tenant.company.id, name: "محاسب بلا فرع", email, passwordHash, userType: "COMPANY_USER", roleId: role.id }, // branchId intentionally omitted
    });

    await login(page, email);
    await page.goto("/app/shipments");
    await expect(page.locator(`text=${shipmentAtA.shipmentNumber}`)).toBeVisible();
    await expect(page.locator(`text=${shipmentAtB.shipmentNumber}`)).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a driver only ever sees their own assigned trip, never another driver's", async ({ page }) => {
    const tenant = await createTestTenant(["فرع أ", "فرع ب"]);
    const [branchA, branchB] = tenant.branches;

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const otherDriverEmail = `other-driver-${Date.now()}@test.local`;
    const otherDriver = await prisma.user.create({
      data: { companyId: tenant.company.id, name: "سائق آخر", email: otherDriverEmail, passwordHash, userType: "DRIVER" },
    });

    const myTrip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [{ branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false }, { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true }],
    });
    const otherTrip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: otherDriver.id,
      stops: [{ branchId: branchB.id, loadingEnabled: true, unloadingEnabled: false }, { branchId: branchA.id, loadingEnabled: false, unloadingEnabled: true }],
    });

    await login(page, tenant.driverEmail);
    await page.goto("/driver");
    await expect(page.locator(`text=${myTrip.tripNumber}`)).toBeVisible();
    await expect(page.locator(`text=${otherTrip.tripNumber}`)).toHaveCount(0);

    // Direct URL to the other driver's trip must refuse, not render their manifest.
    await page.goto(`/driver/trip/${otherTrip.id}`);
    await expectNotFound(page, [otherTrip.tripNumber]);

    // Their own trip works normally.
    const ownRes = await page.goto(`/driver/trip/${myTrip.id}`);
    expect(ownRes?.status()).toBe(200);

    await cleanupTenant(tenant.company.id);
  });
});
