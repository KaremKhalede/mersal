import { test, expect, type Page } from "@playwright/test";
import { createTestTenant, cleanupTenant, login } from "./helpers";

/**
 * Forms, on the screens people actually fill them on.
 *
 * Two things were wrong and both were invisible on a desk monitor.
 *
 * Twenty-two field grids were declared `grid-cols-2` / `grid-cols-3` with no breakpoint, so a
 * three-up row on a 390px phone gave each field about 110px — narrower than the values people type
 * into them. FormDialog's own docstring had been warning about exactly this ("the default 384px
 * turns a 3-up row into three ~110px fields") while the dialogs it renders did it anyway.
 *
 * And requiredness was marked three ways: a "*" typed into the label text (eleven labels), nothing
 * at all (most), and seven asterisks against five genuinely required fields in one dialog, because
 * the glyph and the constraint were maintained separately. It is a `required` prop on Label now, so
 * the marker is generated and cannot drift from what the form actually demands.
 */

const dialogBody = (page: Page) => page.locator('[data-slot="dialog-body"]');

async function openNewShipment(page: Page) {
  await page.goto("/app/shipments");
  await page.getByRole("button", { name: "شحنة جديدة" }).first().click();
  await expect(page.locator('[data-slot="dialog-content"]')).toBeVisible();
}

test.describe("form maturity", () => {
  test("fields stack on a phone instead of splitting into unusable columns", async ({ page }) => {
    const t = await createTestTenant();
    await login(page, t.adminEmail);
    await page.setViewportSize({ width: 390, height: 844 });
    await openNewShipment(page);

    // Every visible field is wide enough to hold what goes in it. 110px was the old three-up width.
    const widths = await dialogBody(page)
      .locator("input:visible, textarea:visible, [role=combobox]:visible")
      .evaluateAll((els) => els.map((e) => ({ id: (e as HTMLElement).id || e.getAttribute("name") || "?", w: Math.round(e.getBoundingClientRect().width) })));

    expect(widths.length).toBeGreaterThan(6);
    for (const f of widths) {
      expect(f.w, `field "${f.id}" is only ${f.w}px wide at 390`).toBeGreaterThan(150);
    }
    await cleanupTenant(t.company.id);
  });

  test("the same form keeps its columns on a desktop", async ({ page }) => {
    // Stacking on a phone must not cost the density the desk actually wants: a 3-up row is still
    // 3-up at sm and above.
    const t = await createTestTenant();
    await login(page, t.adminEmail);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openNewShipment(page);

    const tops = await dialogBody(page)
      .locator("#cartonCount, #weightKg, #goodsType")
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(tops).toHaveLength(3);
    expect(new Set(tops).size, "the three-up row must stay on one line at 1440").toBe(1);

    await cleanupTenant(t.company.id);
  });

  test("required fields are marked, and only required fields are", async ({ page }) => {
    const t = await createTestTenant();
    await login(page, t.adminEmail);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openNewShipment(page);

    const marked = (label: string) =>
      dialogBody(page).locator("label").filter({ hasText: label }).locator("span[aria-hidden='true']");

    // Required by the server, and now said so — the two branch Selects carry no HTML `required`
    // (Radix's hidden proxy cannot be focused by Chrome), so the prop is the only thing that tells
    // the person filling the form.
    await expect(marked("فرع التحميل")).toHaveCount(1);
    await expect(marked("فرع التفريغ")).toHaveCount(1);
    await expect(marked("عدد الكراتين")).toHaveCount(1);

    // Genuinely optional — must stay unmarked.
    await expect(marked("الوزن")).toHaveCount(0);
    await expect(marked("نوع البضاعة")).toHaveCount(0);
    await expect(marked("ملاحظات")).toHaveCount(0);

    await cleanupTenant(t.company.id);
  });

  test("the marker is decorative to assistive tech", async ({ page }) => {
    const t = await createTestTenant();
    await login(page, t.adminEmail);
    await openNewShipment(page);
    // The label's accessible name must not contain a star — requiredness is conveyed by the
    // control, and "carton count star" is noise in a screen reader.
    const name = await dialogBody(page).locator("label").filter({ hasText: "عدد الكراتين" }).innerText();
    expect(name).toContain("عدد الكراتين");
    const stars = await dialogBody(page)
      .locator("label span[aria-hidden='true']")
      .evaluateAll((els) => els.every((e) => e.getAttribute("aria-hidden") === "true"));
    expect(stars).toBe(true);
    await cleanupTenant(t.company.id);
  });
});
