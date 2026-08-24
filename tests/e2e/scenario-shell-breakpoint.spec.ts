import { test, expect, type Page } from "@playwright/test";
import { createTestTenant, createTestPlatformAdmin, cleanupTenant, login, createTestShipment, prisma } from "./helpers";

const WIDTHS = [390, 430, 768, 834, 1024, 1280, 1440];

async function shell(page: Page) {
  return {
    aside: await page.locator("aside").isVisible().catch(() => false),
    burger: await page.getByRole("button", { name: "فتح القائمة" }).isVisible().catch(() => false),
    inlineSearch: await page.locator('form[action="/app/search"] input').isVisible().catch(() => false),
    searchIcon: await page.getByRole("link", { name: "البحث" }).isVisible().catch(() => false),
    table: await page.locator("table").isVisible().catch(() => false),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  };
}

/**
 * Two contracts that are one careless class away from silently regressing.
 *
 * 1. The shell's desktop layout begins at lg (1024), not md (768). It used to switch the *chrome*
 *    at md while the shipments and trips lists switched their *content* at lg — so 768-1023 got the
 *    desktop sidebar eating 256px AND the phone's card list, the worst of both. Chrome and content
 *    now flip on the same line, which is what the width sweep below actually asserts.
 *
 * 2. The notification bell counts FAILED only. SKIPPED has no retry path (retryNotification throws
 *    for any non-FAILED row) and no other action clears it, so counting it made a badge that was
 *    red on day one and could never reach zero. The sequence below is the whole promise a badge
 *    makes: it rises when work appears, falls as work is done, and gets to zero.
 */
test("shell breakpoint + bell", async ({ page }) => {
  test.setTimeout(900_000);
  const tenant = await createTestTenant();
  const [a, b] = tenant.branches;
  for (let i = 0; i < 3; i++) {
    await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: a.id, unloadBranchId: b.id, cartonCount: 2, status: "IN_TRANSIT",
    });
  }

  await login(page, tenant.adminEmail);

  // ---- the breakpoint boundary, on a page that also switches its own content at lg ----
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/app/shipments");
    await page.locator("h1").first().waitFor();
    const s = await shell(page);
    const desktop = w >= 1024;
    console.log(
      `[${String(w).padStart(4)}] aside=${s.aside} burger=${s.burger} inlineSearch=${s.inlineSearch} searchIcon=${s.searchIcon} table=${s.table} overflow=${s.overflow}`
    );
    expect(s.aside, `aside at ${w}`).toBe(desktop);
    expect(s.burger, `burger at ${w}`).toBe(!desktop);
    expect(s.inlineSearch, `inline search at ${w}`).toBe(desktop);
    expect(s.searchIcon, `search icon at ${w}`).toBe(!desktop);
    // chrome and content now flip on the same line
    expect(s.table, `table at ${w}`).toBe(desktop);
    expect(s.overflow, `overflow at ${w}`).toBeLessThanOrEqual(1);
  }

  // trips list flips on the same line
  for (const w of [768, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto("/app/trips");
    await page.locator("h1").first().waitFor();
    expect(await page.locator("aside").isVisible(), `trips aside at ${w}`).toBe(w >= 1024);
  }

  // platform console shares the same shell
  const admin = await createTestPlatformAdmin();
  for (const w of [768, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await login(page, admin.email);
    await page.goto("/platform");
    await page.locator("h1").first().waitFor();
    expect(await page.locator("aside").isVisible(), `platform aside at ${w}`).toBe(w >= 1024);
  }
  await prisma.user.delete({ where: { id: admin.userId } });

  // ---- the bell ----
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, tenant.adminEmail);
  const badge = page.locator('a[aria-label="الإشعارات"] span');

  const seed = async (status: string, n: number) => {
    for (let i = 0; i < n; i++) {
      await prisma.notificationLog.create({
        data: {
          companyId: tenant.company.id, event: "SHIPMENT_RECEIVED", recipient: "SENDER",
          toPhone: "+967700000000", message: "x", status,
          providerError: status === "FAILED" ? "boom" : "no phone number on file",
        },
      });
    }
  };

  // 1. no FAILED, only SKIPPED -> badge absent
  await seed("SKIPPED", 4);
  await page.goto("/app");
  await expect(badge, "SKIPPED must not raise the badge").toHaveCount(0);

  // 2. FAILED rows raise it
  await seed("FAILED", 3);
  await page.goto("/app");
  await expect(badge).toHaveText("3");

  // 3. a FAILED row becoming SENT (what a successful retry does) drops the count
  const one = await prisma.notificationLog.findFirstOrThrow({ where: { companyId: tenant.company.id, status: "FAILED" } });
  await prisma.notificationLog.update({ where: { id: one.id }, data: { status: "SENT" } });
  await page.goto("/app");
  await expect(badge).toHaveText("2");

  // 4. it reaches zero
  await prisma.notificationLog.updateMany({ where: { companyId: tenant.company.id, status: "FAILED" }, data: { status: "SENT" } });
  await page.goto("/app");
  await expect(badge, "the badge must be able to reach zero").toHaveCount(0);

  // 5. the notifications page still shows both, unchanged
  await page.goto("/app/notifications");
  await expect(page.getByTestId("notification-counts")).toContainText("متخطاة: 4");
  await expect(page.getByTestId("notification-counts")).toContainText("فشلت: 0");

  await cleanupTenant(tenant.company.id);
});
