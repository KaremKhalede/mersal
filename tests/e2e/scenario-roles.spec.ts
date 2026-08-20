import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createBranchScopedUser, createTestShipment, login, TEST_PASSWORD, cleanupTenant, expectNotFound } from "./helpers";
import bcrypt from "bcryptjs";
import { updateRole, deleteRole } from "../../src/modules/roles/service";

/**
 * /app/roles redesign — no more duplicate role rows (seed.ts + Role.@@unique([companyId, name])
 * fix), real per-role user counts, disable/delete lifecycle, company isolation, and the permission
 * ceiling that blocks self- and other-escalation. Route-guard-only RBAC (no "roles.view" at all) is
 * the same pattern already proven in scenario-k-rbac-and-auth.spec.ts — not repeated here.
 */
test.describe("Roles & permissions page", () => {
  test("lists roles with real, non-duplicated user counts", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const role = await prisma.role.create({
      data: { companyId: tenant.company.id, name: "دور مشترك اختباري", permissions: JSON.stringify({ shipments: ["view"] }) },
    });
    await prisma.user.createMany({
      data: [
        { companyId: tenant.company.id, name: "موظف 1", email: `shared-1-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER", roleId: role.id },
        { companyId: tenant.company.id, name: "موظف 2", email: `shared-2-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER", roleId: role.id },
      ],
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");
    await expect(page.locator("h2", { hasText: "الأدوار والصلاحيات" })).toBeVisible();
    const rows = page.locator("tr", { hasText: "دور مشترك اختباري" });
    await expect(rows).toHaveCount(1); // one row per role, never one per user
    await expect(rows.locator("td").nth(2)).toHaveText("2");

    await cleanupTenant(tenant.company.id);
  });

  test("creating a role with a name already in use is rejected, no duplicate row is created", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");

    const name = `دور فريد ${Date.now()}`;
    await page.click('button:has-text("دور جديد")');
    await page.fill('input[name="name"]', name);
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await expect(page.locator("tr", { hasText: name })).toBeVisible();

    await page.click('button:has-text("دور جديد")');
    await page.fill('input[name="name"]', name);
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await expect(page.locator("text=يوجد دور بهذا الاسم مسبقًا")).toBeVisible();
    expect(await prisma.role.count({ where: { companyId: tenant.company.id, name } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("creating and editing a role's permissions changes access end-to-end for its holder", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");

    const roleName = `دور محدود ${Date.now()}`;
    await page.click('button:has-text("دور جديد")');
    await page.fill('input[name="name"]', roleName);
    await page.locator('[data-resource="shipments"] label:has-text("عرض") [role="checkbox"]').click();
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await expect(page.locator("tr", { hasText: roleName })).toBeVisible();

    const role = await prisma.role.findFirstOrThrow({ where: { companyId: tenant.company.id, name: roleName } });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const email = `role-holder-${Date.now()}@test.local`;
    await prisma.user.create({ data: { companyId: tenant.company.id, name: "حامل الدور", email, passwordHash, userType: "COMPANY_USER", roleId: role.id } });

    await login(page, email);
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/app/shipments");
    await expect(page).toHaveURL(/\/app\/shipments/);
    await page.goto("/app/billing");
    await expect(page).toHaveURL(/\/app$/); // not granted yet

    // Admin grants billing.view too.
    await login(page, tenant.adminEmail);
    await page.goto(`/app/roles/${role.id}`);
    await page.locator('[data-resource="billing"] label:has-text("عرض") [role="checkbox"]').click();
    await page.click('button:has-text("حفظ التغييرات")');
    await expect(page).toHaveURL(/\/app\/roles$/);

    await login(page, email);
    await page.goto("/app/billing");
    await expect(page).toHaveURL(/\/app\/billing/); // now granted

    await cleanupTenant(tenant.company.id);
  });

  test("disabling a role revokes access for everyone holding it; re-enabling restores it", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const role = await prisma.role.create({
      data: { companyId: tenant.company.id, name: `دور قابل للتعطيل ${Date.now()}`, permissions: JSON.stringify({ shipments: ["view"] }) },
    });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const email = `disable-holder-${Date.now()}@test.local`;
    await prisma.user.create({ data: { companyId: tenant.company.id, name: "حامل دور معطّل", email, passwordHash, userType: "COMPANY_USER", roleId: role.id } });

    await login(page, email);
    await page.goto("/app/shipments");
    await expect(page).toHaveURL(/\/app\/shipments/);

    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");
    const row = page.locator("tr", { hasText: role.name });
    await row.locator("button").click();
    await page.getByRole("menuitem", { name: "تعطيل الدور" }).click();
    await expect(page.locator("text=تعطيل الدور؟")).toBeVisible();
    await expect(page.locator(`text=سيفقد كل من يحمل هذا الدور`)).toBeVisible();
    await page.click('[role="dialog"] button:has-text("تعطيل الدور")');
    await expect(page.locator('[role="dialog"]')).toBeHidden();
    await expect(row.getByText("غير نشط", { exact: true })).toBeVisible();

    await login(page, email);
    await page.goto("/app/shipments");
    await expect(page).toHaveURL(/\/app$/); // disabled role grants nothing now

    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");
    await row.locator("button").click();
    await page.getByRole("menuitem", { name: "تفعيل الدور" }).click();
    await expect(row.getByText("نشط", { exact: true })).toBeVisible();

    await login(page, email);
    await page.goto("/app/shipments");
    await expect(page).toHaveURL(/\/app\/shipments/); // restored

    await cleanupTenant(tenant.company.id);
  });

  test("a role with users attached cannot be deleted; an empty role can", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const inUseRole = await prisma.role.create({ data: { companyId: tenant.company.id, name: `دور مستخدم ${Date.now()}`, permissions: "{}" } });
    const emptyRole = await prisma.role.create({ data: { companyId: tenant.company.id, name: `دور فارغ ${Date.now()}`, permissions: "{}" } });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.create({ data: { companyId: tenant.company.id, name: "مستخدم الدور", email: `inuse-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER", roleId: inUseRole.id } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");

    const inUseRow = page.locator("tr", { hasText: inUseRole.name });
    await inUseRow.locator("button").click();
    await page.getByRole("menuitem", { name: "حذف الدور" }).click();
    await expect(page.locator("text=لا يمكن حذف هذا الدور لأنه مرتبط بموظفين")).toBeVisible();
    await expect(page.locator('[role="dialog"] button:has-text("حذف الدور")')).toBeDisabled();
    await page.keyboard.press("Escape");
    expect(await prisma.role.findUnique({ where: { id: inUseRole.id } })).not.toBeNull();

    const emptyRow = page.locator("tr", { hasText: emptyRole.name });
    await emptyRow.locator("button").click();
    await page.getByRole("menuitem", { name: "حذف الدور" }).click();
    await expect(page.locator('[role="dialog"] button:has-text("حذف الدور")')).toBeEnabled();
    await page.click('[role="dialog"] button:has-text("حذف الدور")');
    await expect(page.locator("tr", { hasText: emptyRole.name })).toHaveCount(0);
    expect(await prisma.role.findUnique({ where: { id: emptyRole.id } })).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("the system role (مدير الشركة) cannot be edited, disabled, or deleted through the UI", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const systemRole = await prisma.role.findFirstOrThrow({ where: { companyId: tenant.company.id, isSystem: true } });

    await login(page, tenant.adminEmail);
    await page.goto("/app/roles");
    const row = page.locator("tr", { hasText: systemRole.name });
    await expect(row.getByRole("link", { name: "عرض" })).toBeVisible();
    await expect(row.locator("button")).toHaveCount(0); // no ⋮ menu at all, just the "عرض" link

    await page.goto(`/app/roles/${systemRole.id}`);
    await expect(page.locator("text=دور نظام أساسي")).toBeVisible();
    await expect(page.locator('input[name="name"]')).toHaveCount(0); // read-only, not the editable form
    await expect(page.locator('[role="checkbox"]').first()).toBeDisabled();

    // Server-layer belt-and-suspenders, bypassing the UI entirely.
    await expect(updateRole(tenant.company.id, systemRole.id, { isActive: false })).rejects.toThrow(/لا يمكن تعديل/);
    await expect(deleteRole(tenant.company.id, systemRole.id)).rejects.toThrow(/لا يمكن حذف/);

    await cleanupTenant(tenant.company.id);
  });

  test("company isolation: another company's role is never listed and its edit page 404s", async ({ page }) => {
    const tenantA = await createTestTenant(["أ"]);
    const tenantB = await createTestTenant(["أ"]);
    const roleB = await prisma.role.create({ data: { companyId: tenantB.company.id, name: `دور شركة ب ${Date.now()}`, permissions: "{}" } });

    await login(page, tenantA.adminEmail);
    await page.goto("/app/roles");
    await expect(page.locator("tr", { hasText: roleB.name })).not.toBeVisible();

    await page.goto(`/app/roles/${roleB.id}`);
    await expectNotFound(page, [roleB.name]);

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });

  test("RBAC: a role without 'roles.manage' cannot create, edit, disable, or delete roles", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const viewOnly = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { roles: ["view"] },
    });

    await login(page, viewOnly.email);
    await page.goto("/app/roles");
    await expect(page.locator('button:has-text("دور جديد")')).toHaveCount(0);
    await expect(page.locator("tbody tr").first().locator("button")).toHaveCount(0); // no actions at all, not even isSystem's "عرض"

    await cleanupTenant(tenant.company.id);
  });

  test("branch scoping still applies to a role holder regardless of the role's own (company-wide) permissions", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipmentAtA = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchA.id, cartonCount: 1 });
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchB.id, cartonCount: 1 });

    const employee = await createBranchScopedUser({ companyId: tenant.company.id, branchId: branchA.id, permissions: { shipments: ["view"] } });
    await login(page, employee.email);
    await page.goto("/app/shipments");
    await expect(page.locator(`text=${shipmentAtA.shipmentNumber}`)).toBeVisible();
    await expect(page.locator(`text=${shipmentAtB.shipmentNumber}`)).not.toBeVisible(); // role.permissions has no branch dimension — branch-scope still restricts

    await cleanupTenant(tenant.company.id);
  });

  test("permission ceiling: a manager cannot grant a role — including their own — permissions they don't themselves hold", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const manager = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { roles: ["view", "manage"], shipments: ["view"] }, // no billing.* of any kind
    });

    await login(page, manager.email);
    await page.goto("/app/roles");

    // Cannot grant billing.manage to a NEW role.
    await page.click('button:has-text("دور جديد")');
    await page.fill('input[name="name"]', `دور تصعيد ${Date.now()}`);
    await page.locator('[data-resource="billing"] label:has-text("إدارة") [role="checkbox"]').click();
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await expect(page.locator("text=لا يمكنك منح صلاحيات لا تملكها")).toBeVisible();

    // Cannot grant it to their OWN role either (self-escalation).
    await page.goto(`/app/roles/${manager.roleId}`);
    await page.locator('[data-resource="billing"] label:has-text("إدارة") [role="checkbox"]').click();
    await page.click('button:has-text("حفظ التغييرات")');
    await expect(page.locator("text=لا يمكنك منح صلاحيات لا تملكها")).toBeVisible();

    const stillHasNoBilling = await prisma.role.findUniqueOrThrow({ where: { id: manager.roleId } });
    expect(JSON.parse(stillHasNoBilling.permissions).billing ?? []).not.toContain("manage");

    await cleanupTenant(tenant.company.id);
  });
});
