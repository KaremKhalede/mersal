import { test, expect } from "@playwright/test";
import { prisma, createTestPlatformAdmin, createTestTenant, login, cleanupTenant } from "./helpers";
import { countActiveSuperAdmins } from "../../src/modules/platform-roles/service";

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/** مستخدمي المنصة — /platform/users (platform staff CRUD only). */
test.describe("Scenario — platform users", () => {
  test("lists platform staff only, never company users or drivers", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const tenant = await createTestTenant(["أ", "ب"]);

    await login(page, admin.email);
    await page.goto("/platform/users");
    await expect(page.getByRole("heading", { name: "مستخدمي المنصة" })).toBeVisible();

    await page.goto(`/platform/users?q=${encodeURIComponent(admin.email)}`);
    await expect(page.locator(`text=${admin.email}`)).toBeVisible();

    // The tenant's own admin is a COMPANY_USER: searching for it here must find nothing at all.
    await page.goto(`/platform/users?q=${encodeURIComponent(tenant.adminEmail)}`);
    await expect(page.locator(`text=${tenant.adminEmail}`)).toHaveCount(0);
    await expect(page.locator("text=لا يوجد مستخدمون مطابقون لبحثك")).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("creates a user, and rejects a duplicate email", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const email = `${uniq("support")}@platform.test`;

    await login(page, admin.email);
    await page.goto("/platform/users");

    await page.click('button:has-text("إضافة مستخدم")');
    await page.fill('input[name="name"]', "سارة الدعم");
    await page.fill('input[name="email"]', email);
    await page.selectOption('select[name="platformRoleId"]', "pr_support");
    await page.fill('input[name="password"]', "Passw0rd!");
    await page.click('[role="dialog"] button:has-text("إضافة المستخدم")');

    const created = await expect
      .poll(async () => prisma.user.findUnique({ where: { email } }))
      .not.toBeNull()
      .then(() => prisma.user.findUniqueOrThrow({ where: { email } }));
    expect(created.userType).toBe("PLATFORM_ADMIN");
    expect(created.platformRoleId).toBe("pr_support");
    expect(created.status).toBe("ACTIVE");

    // Same email again -> friendly duplicate error, no second row.
    await page.reload();
    await page.click('button:has-text("إضافة مستخدم")');
    await page.fill('input[name="name"]', "مكرر");
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', "Passw0rd!");
    await page.click('[role="dialog"] button:has-text("إضافة المستخدم")');
    await expect(page.locator("text=البريد الإلكتروني مستخدم من قبل حساب آخر")).toBeVisible();
    expect(await prisma.user.count({ where: { email } })).toBe(1);

    await prisma.user.delete({ where: { id: created.id } });
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("search and status filter run against the database", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const auditorName = `خالد المراقب ${uniq("t")}`;
    const disabled = await prisma.user.create({
      data: {
        name: auditorName,
        email: `${uniq("auditor")}@platform.test`,
        passwordHash: "x",
        userType: "PLATFORM_ADMIN",
        platformRoleId: "pr_auditor",
        status: "DISABLED",
      },
    });

    await login(page, admin.email);

    await page.goto(`/platform/users?q=${encodeURIComponent(auditorName)}`);
    const row = page.locator("tbody tr", { hasText: auditorName });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("موقوف");

    await page.goto(`/platform/users?q=${encodeURIComponent(auditorName)}&status=ACTIVE`);
    await expect(page.locator("text=لا يوجد مستخدمون مطابقون لبحثك")).toBeVisible();

    await prisma.user.delete({ where: { id: disabled.id } });
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("disabling a user requires confirmation and blocks their login", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const target = await createTestPlatformAdmin();
    await prisma.user.update({ where: { id: target.userId }, data: { platformRoleId: "pr_support", name: "ناصر العمليات" } });

    await login(page, admin.email);
    // Search by the unique email, not a name substring — names repeat across runs.
    await page.goto(`/platform/users?q=${encodeURIComponent(target.email)}`);

    const row = page.locator("tbody tr", { hasText: target.email });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "إجراءات المستخدم" }).click();
    await page.getByRole("menuitem", { name: "إيقاف المستخدم" }).click();
    await expect(page.locator("text=لن يتمكن المستخدم من تسجيل الدخول")).toBeVisible();
    await page.locator('[role="dialog"] button:has-text("إيقاف المستخدم")').click();

    await expect
      .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: target.userId } })).status)
      .toBe("DISABLED");

    // A disabled account cannot sign in (auth already rejects non-ACTIVE users).
    await page.goto("/login");
    await page.fill('input[name="email"]', target.email);
    await page.fill('input[name="password"]', "Passw0rd!");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/login/);

    await prisma.user.delete({ where: { id: target.userId } });
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("self-disable is blocked in the UI, and lockout counting is correct", async ({ page }) => {
    const admin = await createTestPlatformAdmin();

    await login(page, admin.email);
    await page.goto(`/platform/users?q=${encodeURIComponent(admin.email)}`);
    await page.getByRole("button", { name: "إجراءات المستخدم" }).first().click();
    // Own row: the disable entry is present but not actionable.
    await expect(page.getByRole("menuitem", { name: "إيقاف المستخدم" })).toBeDisabled();

    // The lockout guard counts *other* active super admins — excluding a user must lower the total
    // by exactly one, which is what makes "last super admin" detectable.
    const all = await countActiveSuperAdmins();
    expect(await countActiveSuperAdmins(admin.userId)).toBe(all - 1);

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("an operator without platformUsers.manage gets no management affordances", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const support = await createTestPlatformAdmin();
    await prisma.user.update({ where: { id: support.userId }, data: { platformRoleId: "pr_support" } });

    // The support role has no platformUsers permission at all, so the page itself is off-limits.
    await login(page, support.email);
    await page.goto("/platform/users");
    await expect(page).not.toHaveURL(/\/platform\/users$/);

    await prisma.user.delete({ where: { id: support.userId } });
    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a company user cannot reach the platform users page", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    await login(page, tenant.adminEmail);
    await page.goto("/platform/users");
    await expect(page).not.toHaveURL(/\/platform\/users$/);

    await cleanupTenant(tenant.company.id);
  });

  test("last login is recorded on sign-in", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).lastLoginAt).toBeNull();

    await login(page, admin.email);
    await expect
      .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: admin.userId } })).lastLoginAt)
      .not.toBeNull();

    await page.goto("/platform/users");
    await expect(page.locator("text=اليوم").first()).toBeVisible();

    await prisma.user.delete({ where: { id: admin.userId } });
  });
});
