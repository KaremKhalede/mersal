import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import { prisma, login } from "./helpers";
import {
  canPlatform,
  platformPermissionsOf,
  permissionsAboveCeiling,
  sanitizePlatformPermissions,
} from "../../src/lib/rbac";
import { ALL_PLATFORM_PERMISSIONS } from "../../src/lib/enums";

const uniq = (p: string) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

/** Creates a platform account holding one of the seeded system roles. */
async function makeOperator(roleId: string, name = "موظف اختبار") {
  const email = `${uniq("op")}@rbac.test`;
  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash("Passw0rd!", 10),
      userType: "PLATFORM_ADMIN",
      platformRoleId: roleId,
    },
  });
  return { id: user.id, email };
}

const actor = (permissions: string, isSuperAdmin = false) => ({
  userType: "PLATFORM_ADMIN",
  platformRoleRef: { permissions, isSuperAdmin, isActive: true },
});

test.describe("Scenario — platform RBAC", () => {
  test("super admin holds every permission, including ones added later", () => {
    const su = actor("{}", true);
    for (const key of ALL_PLATFORM_PERMISSIONS) {
      const [resource, action] = key.split(".");
      expect(canPlatform(su, resource as never, action), key).toBe(true);
    }
    // A future resource the seed never listed still resolves true — that's why it's a flag.
    expect(canPlatform(su, "reports" as never, "view")).toBe(true);
    expect(platformPermissionsOf(su)).toEqual(ALL_PLATFORM_PERMISSIONS);
  });

  test("a restricted role grants exactly what it lists, and nothing else", () => {
    const support = actor('{"dashboard":["view"],"companies":["view"]}');
    expect(canPlatform(support, "companies", "view")).toBe(true);
    expect(canPlatform(support, "companies", "manage")).toBe(false);
    expect(canPlatform(support, "billing", "view")).toBe(false);
    expect(canPlatform(support, "platformUsers", "view")).toBe(false);
    expect(canPlatform(support, "settings", "view")).toBe(false);
  });

  test("read-only can view but never manage", () => {
    const auditor = actor('{"dashboard":["view"],"companies":["view"],"billing":["view"]}');
    expect(canPlatform(auditor, "billing", "view")).toBe(true);
    expect(canPlatform(auditor, "billing", "manage")).toBe(false);
    expect(canPlatform(auditor, "billing", "reviewPayment")).toBe(false);
    expect(canPlatform(auditor, "companies", "manage")).toBe(false);
  });

  test("fails closed: no role, inactive role, malformed permissions, or a company user", () => {
    expect(canPlatform({ userType: "PLATFORM_ADMIN", platformRoleRef: null }, "companies", "view")).toBe(false);
    expect(
      canPlatform(
        { userType: "PLATFORM_ADMIN", platformRoleRef: { permissions: "{}", isSuperAdmin: true, isActive: false } },
        "companies",
        "view"
      )
    ).toBe(false);
    expect(canPlatform(actor("not-json"), "companies", "view")).toBe(false);
    expect(canPlatform({ userType: "COMPANY_USER" }, "companies", "view")).toBe(false);
    expect(canPlatform(null, "companies", "view")).toBe(false);
  });

  test("permission ceiling: nobody can grant what they do not hold", () => {
    const support = actor('{"companies":["view"]}');
    // Trying to mint a role with billing.manage while holding only companies.view.
    expect(permissionsAboveCeiling({ billing: ["manage"] }, support)).toEqual(["billing.manage"]);
    expect(permissionsAboveCeiling({ companies: ["view"] }, support)).toEqual([]);
    // A super admin has no ceiling.
    expect(permissionsAboveCeiling({ billing: ["manage"] }, actor("{}", true))).toEqual([]);
  });

  test("a tampered permission payload is stripped of unknown keys", () => {
    const cleaned = sanitizePlatformPermissions({
      companies: ["view", "destroy"],
      wallets: ["manage"],
      billing: "not-an-array",
    });
    expect(cleaned).toEqual({ companies: ["view"] });
  });

  test("support role: sees companies and billing pages, never users or settings", async ({ page }) => {
    const op = await makeOperator("pr_support", "موظف دعم");
    await login(page, op.email);

    const nav = page.locator("aside nav");
    await expect(nav.getByRole("link", { name: "الشركات", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "الفوترة", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "مستخدمو المنصة" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "إعدادات المنصة" })).toHaveCount(0);

    // Direct URL access is blocked by the page guard, not just hidden in the nav.
    await page.goto("/platform/users");
    await expect(page).not.toHaveURL(/\/platform\/users$/);
    await page.goto("/platform/settings");
    await expect(page).not.toHaveURL(/\/platform\/settings$/);

    // What it may open, it opens.
    expect((await page.goto("/platform/companies"))?.status()).toBe(200);

    await prisma.user.delete({ where: { id: op.id } });
  });

  test("support role sees companies read-only — no create, no row actions", async ({ page }) => {
    const op = await makeOperator("pr_support");
    await login(page, op.email);
    await page.goto("/platform/companies");

    await expect(page.locator('button:has-text("إضافة شركة جديدة")')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "إجراءات الشركة" })).toHaveCount(0);

    await prisma.user.delete({ where: { id: op.id } });
  });

  test("finance role reaches billing and the review queue, but not platform users", async ({ page }) => {
    const op = await makeOperator("pr_finance", "موظف محاسبة");
    await login(page, op.email);

    expect((await page.goto("/platform/billing"))?.status()).toBe(200);
    await page.goto("/platform/users");
    await expect(page).not.toHaveURL(/\/platform\/users$/);

    await prisma.user.delete({ where: { id: op.id } });
  });

  test("auditor cannot review payments — the queue is not even rendered", async ({ page }) => {
    const op = await makeOperator("pr_auditor", "مراقب");
    await login(page, op.email);
    await page.goto("/platform/billing");

    await expect(page.locator("text=دفعات بانتظار المراجعة")).toHaveCount(0);
    await expect(page.locator('button:has-text("تأكيد")')).toHaveCount(0);

    await prisma.user.delete({ where: { id: op.id } });
  });

  test("adding a new resource needs no RBAC rewrite — only the registry", () => {
    // Simulating a future "reports" resource: a role that lists it resolves immediately, because
    // canPlatform reads the role's JSON rather than a hard-coded switch.
    const withFuture = actor('{"reports":["view"]}');
    expect(canPlatform(withFuture, "reports" as never, "view")).toBe(true);
    expect(canPlatform(withFuture, "reports" as never, "manage")).toBe(false);
  });

  test("a role without dashboard.view lands on its first reachable page, never a redirect loop", async ({ page }) => {
    const role = await prisma.platformRole.create({
      data: {
        name: uniq("فوترة فقط"),
        permissions: JSON.stringify({ billing: ["view"] }),
      },
    });
    const op = await makeOperator(role.id, "موظف فوترة فقط");

    await login(page, op.email);
    // Login sends every platform account to /platform; without dashboard.view that page must hand
    // off to /platform/billing rather than bounce to itself.
    await expect(page).toHaveURL(/\/platform\/billing/);
    await expect(page.getByRole("heading", { name: "الفوترة" })).toBeVisible();

    await prisma.user.delete({ where: { id: op.id } });
    await prisma.platformRole.delete({ where: { id: role.id } });
  });

  test("the seeded system roles exist with the expected shape", async () => {
    const roles = await prisma.platformRole.findMany({ orderBy: { createdAt: "asc" } });
    expect(roles.length).toBeGreaterThanOrEqual(5);
    const su = roles.find((r) => r.isSuperAdmin);
    expect(su?.name).toBe("مدير المنصة");
    expect(su?.isSystem).toBe(true);
    // Every non-super role stores real permission keys.
    for (const r of roles.filter((x) => !x.isSuperAdmin)) {
      expect(() => JSON.parse(r.permissions)).not.toThrow();
    }
  });
});
