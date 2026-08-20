import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createBranchScopedUser, login, TEST_PASSWORD, cleanupTenant, expectNotFound } from "./helpers";
import bcrypt from "bcryptjs";
import { listEmployeesPaged, getEmployeeDetail, updateEmployeeStatus, createEmployee } from "../../src/modules/users/service";

/**
 * /app/employees redesign — list/search/filter/pagination, create/edit/disable/re-enable,
 * company + branch isolation, RBAC, and the passwordHash-never-leaves-the-server guarantee.
 * Route-guard redirects (no session, no "employees.view") are already covered by
 * scenario-f-driver-permissions.spec.ts and scenario-k-rbac-and-auth.spec.ts — not repeated here.
 */
test.describe("Employees page", () => {
  test("lists employees with role, branch, employee code, and status", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");

    await expect(page.locator("h2", { hasText: "الموظفون" })).toBeVisible();
    const adminRow = page.locator("tr", { hasText: "مدير اختبار" });
    await expect(adminRow).toBeVisible();
    await expect(adminRow.locator("text=نشط")).toBeVisible();
    await expect(page.locator("tr", { hasText: "سائق اختبار" })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("search narrows by name/email/phone", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.create({
      data: { companyId: tenant.company.id, name: "زيد الاختباري", email: `zaid-${Date.now()}@test.local`, phone: "+966599990000", passwordHash, userType: "COMPANY_USER" },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");
    await page.fill('input[placeholder*="ابحث عن موظف"]', "زيد");
    await expect(page).toHaveURL(/q=/);
    await expect(page.locator("tr", { hasText: "زيد الاختباري" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "مدير اختبار" })).not.toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("role and branch filters narrow the list, status filter shows disabled accounts", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [, branchB] = tenant.branches;
    const opsRole = await prisma.role.create({ data: { companyId: tenant.company.id, name: "دور فرعي اختباري", permissions: "{}" } });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const branchBEmployee = await prisma.user.create({
      data: { companyId: tenant.company.id, name: "موظف فرع ب", email: `branchb-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER", roleId: opsRole.id, branchId: branchB.id },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");

    // Role filter — the role select is the first of the filter row's <select>s (before branch/status).
    await page.locator("select").first().selectOption(opsRole.id);
    await expect(page.locator("tr", { hasText: "موظف فرع ب" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "مدير اختبار" })).not.toBeVisible();

    // Branch filter (company-wide admin can narrow by branch).
    await page.goto(`/app/employees?branchId=${branchB.id}`);
    await expect(page.locator("tr", { hasText: "موظف فرع ب" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "سائق اختبار" })).not.toBeVisible();

    // Status filter — disable the branch-B employee first.
    await updateEmployeeStatus(tenant.company.id, branchBEmployee.id, "DISABLED");
    await page.goto("/app/employees?status=DISABLED");
    await expect(page.locator("tr", { hasText: "موظف فرع ب" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "غير نشط" })).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("pagination reflects the real total and navigates pages", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    await prisma.user.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        companyId: tenant.company.id,
        name: `موظف رقم ${i + 1}`,
        email: `bulk-${Date.now()}-${i}@test.local`,
        passwordHash,
        userType: "COMPANY_USER" as const,
      })),
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");
    await expect(page.locator("text=إظهار 10 من 14 موظف")).toBeVisible();
    await page.getByRole("link", { name: "2", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator("tbody tr")).toHaveCount(4);

    await cleanupTenant(tenant.company.id);
  });

  test("creating an employee auto-generates a unique employee code and rejects a duplicate email", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");

    const email = `new-emp-${Date.now()}@test.local`;
    await page.click('button:has-text("موظف جديد")');
    await page.fill('input[name="name"]', "موظف جديد للاختبار");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="phone"]', "+966501112222");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.fill('input[name="passwordConfirm"]', TEST_PASSWORD);
    await page.locator('[role="dialog"] button[role="combobox"]').last().click();
    await page.locator('[role="option"]').first().click(); // first available role
    await page.click('[role="dialog"] button:has-text("حفظ الموظف")');

    const row = page.locator("tr", { hasText: "موظف جديد للاختبار" });
    await expect(row).toBeVisible();
    await expect(row.locator("text=/EMP-\\d{4}/")).toBeVisible();

    // Duplicate email — same dialog, rejected with an Arabic error, no second row created.
    await page.click('button:has-text("موظف جديد")');
    await page.fill('input[name="name"]', "تكرار البريد");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="phone"]', "+966501112223");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.fill('input[name="passwordConfirm"]', TEST_PASSWORD);
    await page.locator('[role="dialog"] button[role="combobox"]').last().click();
    await page.locator('[role="option"]').first().click();
    await page.click('[role="dialog"] button:has-text("حفظ الموظف")');
    await expect(page.locator("text=البريد الإلكتروني مستخدم من قبل موظف آخر")).toBeVisible();
    expect(await prisma.user.count({ where: { companyId: tenant.company.id, email } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("editing an employee saves changes; disabling then re-enabling toggles the status badge", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const role = await prisma.role.create({ data: { companyId: tenant.company.id, name: "دور تعديل اختباري", permissions: "{}" } });
    const target = await prisma.user.create({
      data: { companyId: tenant.company.id, name: "قبل التعديل", email: `edit-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER", roleId: role.id },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");
    const row = page.locator("tr", { hasText: "قبل التعديل" });
    await row.locator("button").click(); // the row's single ⋮ actions trigger
    await page.getByRole("menuitem", { name: "تعديل", exact: true }).click();
    await page.fill('input[name="name"]', "الاسم المحدّث");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await expect(page.locator("tr", { hasText: "الاسم المحدّث" })).toBeVisible();

    // Disable — styled confirm dialog, exact copy required by spec.
    const updatedRow = page.locator("tr", { hasText: "الاسم المحدّث" });
    await updatedRow.locator("button").click();
    await page.getByRole("menuitem", { name: "تعطيل الحساب" }).click();
    await expect(page.locator("text=تعطيل حساب الموظف؟")).toBeVisible();
    await expect(page.locator("text=لن يتمكن الموظف من تسجيل الدخول إلى النظام")).toBeVisible();
    await page.click('[role="dialog"] button:has-text("تعطيل الحساب")');
    await expect(page.locator('[role="dialog"]')).toBeHidden();
    await expect(updatedRow.getByText("غير نشط", { exact: true })).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("DISABLED");

    // Re-enable — no confirm dialog required by spec.
    await updatedRow.locator("button").click();
    await page.getByRole("menuitem", { name: "تفعيل الحساب" }).click();
    await expect(updatedRow.getByText("نشط", { exact: true })).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe("ACTIVE");

    await cleanupTenant(tenant.company.id);
  });

  test("company isolation: another company's employees never appear, and their detail page 404s", async ({ page }) => {
    const tenantA = await createTestTenant(["أ"]);
    const tenantB = await createTestTenant(["أ"]);

    await login(page, tenantA.adminEmail);
    await page.goto("/app/employees");
    await expect(page.locator("tr", { hasText: tenantB.adminEmail })).not.toBeVisible();
    await expect(page.locator("body")).not.toContainText(tenantB.driverEmail);

    await page.goto(`/app/employees/${tenantB.adminId}`);
    await expectNotFound(page, [tenantB.adminEmail]);

    // Service layer, no company filter bypass possible.
    const detail = await getEmployeeDetail(tenantA.company.id, tenantB.adminId);
    expect(detail).toBeNull();

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });

  test("branch isolation: a branch-scoped employee only sees their own branch and cannot act outside it", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const branchEmployee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { employees: ["view", "create", "edit", "disable"] },
    });
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    const targetInB = await prisma.user.create({
      data: { companyId: tenant.company.id, name: "موظف في فرع ب", email: `branchb-target-${Date.now()}@test.local`, passwordHash, userType: "COMPANY_USER", branchId: branchB.id },
    });

    // UI: branch filter hidden, list pinned to own branch, cross-branch detail 404s.
    await login(page, branchEmployee.email);
    await page.goto("/app/employees");
    await expect(page.locator("text=كل الفروع")).not.toBeVisible();
    await expect(page.locator("tr", { hasText: "موظف في فرع ب" })).not.toBeVisible();
    await page.goto(`/app/employees/${targetInB.id}`);
    await expectNotFound(page, ["موظف في فرع ب"]);

    // Mutation layer — same guarantee bypassing the UI entirely, mirroring scenario-r's pattern.
    await expect(updateEmployeeStatus(tenant.company.id, targetInB.id, "DISABLED", branchA.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(
      createEmployee({ companyId: tenant.company.id, branchScope: branchA.id, branchId: branchB.id, name: "محاولة تجاوز الفرع", email: `bypass-${Date.now()}@test.local`, password: TEST_PASSWORD, userType: "COMPANY_USER" })
    ).resolves.toMatchObject({ branchId: branchA.id }); // pinned to the actor's own branch, not the requested one

    await cleanupTenant(tenant.company.id);
  });

  test("RBAC: a view-only role sees no add/edit/disable actions", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);
    const viewOnly = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { employees: ["view"] },
      roleName: "مشاهد فقط",
    });

    await login(page, viewOnly.email);
    await page.goto("/app/employees");
    await expect(page.locator('button:has-text("موظف جديد")')).toHaveCount(0);
    const anyRow = page.locator("tbody tr").first();
    await anyRow.locator("button").last().click();
    await expect(page.locator("text=عرض الموظف")).toBeVisible();
    await expect(page.locator("text=تعديل")).toHaveCount(0);
    await expect(page.locator("text=تعطيل الحساب")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("passwordHash never reaches the client", async ({ page }) => {
    const tenant = await createTestTenant(["أ"]);

    const { items } = await listEmployeesPaged({ companyId: tenant.company.id });
    expect(Object.keys(items[0] ?? {})).not.toContain("passwordHash");
    const detail = await getEmployeeDetail(tenant.company.id, tenant.adminId);
    expect(Object.keys(detail ?? {})).not.toContain("passwordHash");

    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");
    const html = await page.content();
    expect(html).not.toContain("passwordHash");
    expect(html).not.toMatch(/\$2[aby]\$/); // bcrypt hash prefix

    await cleanupTenant(tenant.company.id);
  });
});
