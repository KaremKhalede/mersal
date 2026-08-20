import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createBranchScopedUser, createTestTrip, login, cleanupTenant, expectNotFound } from "./helpers";

/**
 * /app/vehicles — plate/type/notes CRUD, soft disable (never a hard delete once a vehicle has trip
 * history), real trip counts via aggregation, company isolation, and RBAC. Vehicle has no branchId
 * in this data model (a vehicle isn't owned by one branch — it's assigned per-trip, same as a
 * driver), so there is no branch dimension to scope by here; that's confirmed directly in the
 * "company-wide regardless of viewer's branch" test below rather than assumed.
 */
test.describe("Vehicles page", () => {
  test("lists vehicles with type label and a real trip count", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "TEST-1001", type: "TRUCK" } });
    await createTestTrip({ companyId: tenant.company.id, vehicleId: vehicle.id, stops: [{ branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: true }] });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    await expect(page.locator("h2", { hasText: "المركبات" })).toBeVisible();
    const row = page.locator("tr", { hasText: "TEST-1001" });
    await expect(row).toBeVisible();
    await expect(row.locator("td").nth(1)).toHaveText("شاحنة");
    await expect(row.locator("td").nth(2)).toHaveText("1");
    await expect(row.getByText("نشطة", { exact: true })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("search by plate number narrows the list", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "SEARCH-A", type: "VAN" } });
    await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "SEARCH-B", type: "VAN" } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    await page.fill('input[placeholder*="ابحث برقم اللوحة"]', "SEARCH-A");
    await expect(page).toHaveURL(/q=/);
    await expect(page.locator("tr", { hasText: "SEARCH-A" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "SEARCH-B" })).not.toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("status filter shows only active or only disabled vehicles", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "STATUS-ON", type: "VAN" } });
    await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "STATUS-OFF", type: "VAN", isActive: false } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles?status=INACTIVE");
    await expect(page.locator("tr", { hasText: "STATUS-OFF" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "STATUS-ON" })).not.toBeVisible();

    await page.goto("/app/vehicles?status=ACTIVE");
    await expect(page.locator("tr", { hasText: "STATUS-ON" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "STATUS-OFF" })).not.toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("opens the vehicle detail page showing plate, type, status, trip count, and last trip", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "DETAIL-1", type: "DYNA", notes: "ملاحظة اختبار" } });
    const driver = await prisma.user.create({ data: { companyId: tenant.company.id, name: "سائق الرحلة", email: `driver-detail-${Date.now()}@test.local`, passwordHash: "x", userType: "DRIVER" } });
    const trip = await createTestTrip({ companyId: tenant.company.id, vehicleId: vehicle.id, driverId: driver.id, stops: [{ branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: true }] });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    await page.click('tr:has-text("DETAIL-1") a[href^="/app/vehicles/"]');
    await expect(page).toHaveURL(new RegExp(`/app/vehicles/${vehicle.id}`));
    await expect(page.locator("text=دينا").first()).toBeVisible();
    await expect(page.locator("text=ملاحظة اختبار")).toBeVisible();
    await expect(page.locator(`text=${trip.tripNumber}`).first()).toBeVisible();
    await expect(page.locator("text=سائق الرحلة").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("creating a vehicle requires plate and type; duplicate plate in the same company is rejected; the same plate is allowed in a different company", async ({ page }) => {
    const tenantA = await createTestTenant(["أ"]);
    const tenantB = await createTestTenant(["أ"]);
    const plate = `DUP-${Date.now()}`;

    await login(page, tenantA.adminEmail);
    await page.goto("/app/vehicles");
    await page.click('button:has-text("مركبة جديدة")');
    await page.fill('input[name="plateNumber"]', plate);
    await page.locator('[role="dialog"] button[role="combobox"]').click();
    await page.locator('[role="option"]:has-text("فان")').click();
    await page.click('[role="dialog"] button:has-text("حفظ المركبة")');
    await expect(page.locator("tr", { hasText: plate })).toBeVisible();

    // Same plate, same company -> rejected.
    await page.click('button:has-text("مركبة جديدة")');
    await page.fill('input[name="plateNumber"]', plate);
    await page.locator('[role="dialog"] button[role="combobox"]').click();
    await page.locator('[role="option"]:has-text("فان")').click();
    await page.click('[role="dialog"] button:has-text("حفظ المركبة")');
    await expect(page.locator("text=رقم اللوحة مستخدم من قبل مركبة أخرى في الشركة")).toBeVisible();
    expect(await prisma.vehicle.count({ where: { companyId: tenantA.company.id, plateNumber: plate } })).toBe(1);

    // Same plate, different company -> allowed.
    const vehicleB = await prisma.vehicle.create({ data: { companyId: tenantB.company.id, plateNumber: plate, type: "VAN" } });
    expect(vehicleB.plateNumber).toBe(plate);

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });

  test("editing a vehicle updates plate, type, and notes", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "EDIT-BEFORE", type: "VAN" } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    const row = page.locator("tr", { hasText: "EDIT-BEFORE" });
    await row.locator("button").click();
    await page.getByRole("menuitem", { name: "تعديل" }).click();
    await page.fill('input[name="plateNumber"]', "EDIT-AFTER");
    await page.fill('textarea[name="notes"]', "تمت الصيانة الأسبوعية");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await expect(page.locator("tr", { hasText: "EDIT-AFTER" })).toBeVisible();

    const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(updated.plateNumber).toBe("EDIT-AFTER");
    expect(updated.notes).toBe("تمت الصيانة الأسبوعية");

    await cleanupTenant(tenant.company.id);
  });

  test("disabling then re-enabling a vehicle toggles the status badge, with a styled confirm dialog for disabling", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "TOGGLE-1", type: "VAN" } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    const row = page.locator("tr", { hasText: "TOGGLE-1" });
    await row.locator("button").click();
    await page.getByRole("menuitem", { name: "تعطيل" }).click();
    await expect(page.locator("text=تعطيل المركبة؟")).toBeVisible();
    await expect(page.locator("text=لن تظهر المركبة كمركبة متاحة عند إنشاء رحلات جديدة")).toBeVisible();
    await page.click('[role="dialog"] button:has-text("تعطيل المركبة")');
    await expect(page.locator('[role="dialog"]')).toBeHidden();
    await expect(row.getByText("غير نشطة", { exact: true })).toBeVisible();
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).isActive).toBe(false);

    await row.locator("button").click();
    await page.getByRole("menuitem", { name: "تفعيل" }).click();
    await expect(row.getByText("نشطة", { exact: true })).toBeVisible();
    expect((await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).isActive).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("disabling a vehicle with trip history never deletes it — trips stay fully intact and visible", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "HISTORY-1", type: "TRUCK" } });
    const trip = await createTestTrip({ companyId: tenant.company.id, vehicleId: vehicle.id, stops: [{ branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: true }] });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    const row = page.locator("tr", { hasText: "HISTORY-1" });
    await row.locator("button").click();
    await page.getByRole("menuitem", { name: "تعطيل" }).click();
    await page.click('[role="dialog"] button:has-text("تعطيل المركبة")');
    await expect(row.getByText("غير نشطة", { exact: true })).toBeVisible();

    // Vehicle row (and its detail page) survive intact — this was always soft-disable, never delete.
    expect(await prisma.vehicle.findUnique({ where: { id: vehicle.id } })).not.toBeNull();
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).vehicleId).toBe(vehicle.id);
    await page.goto(`/app/vehicles/${vehicle.id}`);
    await expect(page.locator(`text=${trip.tripNumber}`).first()).toBeVisible();
    const stillOne = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id }, include: { _count: { select: { trips: true } } } });
    expect(stillOne._count.trips).toBe(1); // trip count still 1, disabling never touches trip history

    await cleanupTenant(tenant.company.id);
  });

  test("trip count reflects real trips and updates as new trips are linked", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const vehicle = await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "COUNT-1", type: "VAN" } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/vehicles");
    await expect(page.locator("tr", { hasText: "COUNT-1" }).locator("td").nth(2)).toHaveText("0");

    await createTestTrip({ companyId: tenant.company.id, vehicleId: vehicle.id, stops: [{ branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: true }] });
    await createTestTrip({ companyId: tenant.company.id, vehicleId: vehicle.id, stops: [{ branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: true }] });

    await page.reload();
    await expect(page.locator("tr", { hasText: "COUNT-1" }).locator("td").nth(2)).toHaveText("2");

    await cleanupTenant(tenant.company.id);
  });

  test("company isolation: another company's vehicles never appear, and the detail page 404s", async ({ page }) => {
    const tenantA = await createTestTenant(["أ"]);
    const tenantB = await createTestTenant(["أ"]);
    const vehicleB = await prisma.vehicle.create({ data: { companyId: tenantB.company.id, plateNumber: "ISOLATED-B", type: "VAN" } });

    await login(page, tenantA.adminEmail);
    await page.goto("/app/vehicles");
    await expect(page.locator("tr", { hasText: "ISOLATED-B" })).not.toBeVisible();

    await page.goto(`/app/vehicles/${vehicleB.id}`);
    await expectNotFound(page, ["ISOLATED-B"]);

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });

  test("RBAC: a view-only role sees no create/edit/disable actions", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "RBAC-1", type: "VAN" } });
    const viewOnly = await createBranchScopedUser({ companyId: tenant.company.id, branchId: tenant.branches[0].id, permissions: { vehicles: ["view"] } });

    await login(page, viewOnly.email);
    await page.goto("/app/vehicles");
    await expect(page.locator('button:has-text("مركبة جديدة")')).toHaveCount(0);
    const row = page.locator("tr", { hasText: "RBAC-1" });
    await row.locator("button").click();
    await expect(page.getByRole("menuitem", { name: "عرض التفاصيل" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "تعديل" })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "تعطيل" })).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("vehicles are company-wide: a branch-scoped employee sees every vehicle in the company, not just their branch's", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await prisma.vehicle.create({ data: { companyId: tenant.company.id, plateNumber: "WIDE-1", type: "VAN" } });
    const branchEmployee = await createBranchScopedUser({ companyId: tenant.company.id, branchId: tenant.branches[0].id, permissions: { vehicles: ["view"] } });

    await login(page, branchEmployee.email);
    await page.goto("/app/vehicles");
    await expect(page.locator("tr", { hasText: "WIDE-1" })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
