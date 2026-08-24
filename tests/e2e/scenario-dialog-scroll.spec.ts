import { test, expect, type Page } from "@playwright/test";
import { createTestTenant, cleanupTenant, login } from "./helpers";

/**
 * The dialog shell: header fixed, body scrolls, footer fixed.
 *
 * Before this, DialogContent had no max-height and no scroll region of its own. A dialog taller
 * than the viewport simply overflowed it in both directions, and because Radix locks page scroll
 * while a dialog is open there was no way to reach what had spilled off — including the submit
 * button. "تسجيل شحنة جديدة" is ~660px tall; a 1366×768 laptop has ~640px of viewport. The single
 * most-used form in the product could not be submitted on the single most common office screen.
 *
 * These assertions are about geometry, not appearance, so they hold whatever the fields become:
 * the actions stay reachable, the title stays put, and only the body moves.
 */

const VIEWPORTS = [
  { name: "1366x768 laptop", width: 1366, height: 768 },
  // The same laptop with its browser chrome counted. Playwright's `height` is the content area, so
  // 768 here models a 1366x768 screen running the page full-bleed; a real one loses ~130px to the
  // tab strip, address bar and OS taskbar. This is the case the fix exists for, and the only entry
  // where the body genuinely overflows — without it the scroll assertions below never run.
  { name: "1366x640 laptop (chrome counted)", width: 1366, height: 640 },
  { name: "1440x900 desktop", width: 1440, height: 900 },
  { name: "768x844 tablet", width: 768, height: 844 },
  { name: "430x844 phone-max", width: 430, height: 844 },
  { name: "390x844 phone", width: 390, height: 844 },
];

const dialog = (page: Page) => page.locator('[data-slot="dialog-content"]');
const body = (page: Page) => page.locator('[data-slot="dialog-body"]');
const submit = (page: Page) => page.locator('[data-slot="dialog-footer"] button[type="submit"]');
const cancel = (page: Page) => page.locator('[data-slot="dialog-footer"] button', { hasText: "إلغاء" });

async function openNewShipment(page: Page) {
  await page.goto("/app/shipments");
  await page.getByRole("button", { name: "شحنة جديدة" }).first().click();
  await expect(dialog(page)).toBeVisible();
}

test.describe("dialog shell — header fixed / body scrolls / footer fixed", () => {
  let tenant: Awaited<ReturnType<typeof createTestTenant>>;

  test.beforeAll(async () => {
    tenant = await createTestTenant();
  });
  test.afterAll(async () => {
    await cleanupTenant(tenant.company.id);
  });

  for (const vp of VIEWPORTS) {
    test(`the tallest form stays operable at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await login(page, tenant.adminEmail);
      await openNewShipment(page);

      // 1. The dialog never exceeds the viewport, so nothing can be off-screen to begin with.
      const box = (await dialog(page).boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1); // +1 for sub-pixel rounding

      // 2. The whole point: both ways out are reachable without scrolling anything.
      await expect(submit(page)).toBeInViewport();
      await expect(cancel(page)).toBeInViewport();

      // 3. Scrolling happens in the body and nowhere else.
      const scrollable = await body(page).evaluate((el) => el.scrollHeight > el.clientHeight + 1);
      const pageScrollBefore = await page.evaluate(() => window.scrollY);
      if (scrollable) {
        await body(page).evaluate((el) => el.scrollTo(0, el.scrollHeight));
        expect(await body(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);

        // 4. Header and footer did not travel with the content.
        await expect(page.getByRole("heading", { name: "تسجيل شحنة جديدة" })).toBeInViewport();
        await expect(submit(page)).toBeInViewport();
        await expect(cancel(page)).toBeInViewport();

        // 5. The last field cleared the footer rather than hiding behind it.
        const notes = page.locator("#notes");
        await expect(notes).toBeInViewport();
        const notesBox = (await notes.boundingBox())!;
        const footerBox = (await page.locator('[data-slot="dialog-footer"]').boundingBox())!;
        expect(notesBox.y + notesBox.height).toBeLessThanOrEqual(footerBox.y + 1);
      }
      // 6. The page underneath never moved, at any viewport.
      expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore);

      // 7. Escape still closes — the new scroll container did not swallow the key event.
      await page.keyboard.press("Escape");
      await expect(dialog(page)).toBeHidden();
    });
  }

  test("focusing a field below the fold scrolls the body, not the page", async ({ page }) => {
    // The scroll container has to be the body. Radix locks page scroll while a dialog is open, so
    // if the overflow lived anywhere else, the browser would have nothing it could scroll to bring
    // a focused field into view — which is also how native validation reaches a required field it
    // has to complain about.
    await page.setViewportSize({ width: 1366, height: 640 }); // see VIEWPORTS — the overflowing case
    await login(page, tenant.adminEmail);
    await openNewShipment(page);

    expect(await body(page).evaluate((el) => el.scrollTop)).toBe(0);

    await page.locator("#notes").focus();

    expect(await body(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator("#notes")).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test("typed values survive a refused submit", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await login(page, tenant.adminEmail);
    await openNewShipment(page);

    await page.fill("#receiverName", "مستلم محفوظ");
    await page.fill("#goodsType", "بضاعة محفوظة");
    await submit(page).click(); // required branch selects are still empty

    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#receiverName")).toHaveValue("مستلم محفوظ");
    await expect(page.locator("#goodsType")).toHaveValue("بضاعة محفوظة");
  });

  test("a short dialog stays short", async ({ page }) => {
    // max-h is a cap, not a height: a two-line confirm must not stretch to 85dvh.
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, tenant.adminEmail);
    await page.goto("/app/branches");
    await page.getByRole("button", { name: "فرع جديد" }).first().click();
    await expect(dialog(page)).toBeVisible();

    const box = (await dialog(page).boundingBox())!;
    expect(box.height).toBeLessThan(900 * 0.85);
    // Nothing to scroll, so the body must not be showing a scrollbar.
    expect(await body(page).evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  });
});
