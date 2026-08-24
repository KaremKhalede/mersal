import { test, expect } from "@playwright/test";
import { prisma, createTestPlatformAdmin, login, visibleText } from "./helpers";
import { PLATFORM_ID } from "../../src/lib/platform";

/**
 * THE UNBRANDED FALLBACK AT /track — the door for a visitor who does not know which carrier is
 * holding their goods. Every carrier has its own branded door at /track/<slug>.
 *
 * Two claims worth pinning:
 *   1. Nobody's brand is on it. Not a carrier's — none is knowable before the number resolves — and
 *      not the platform's either: Chargee is white-label infrastructure, and a customer's
 *      relationship is with the shipping office, never with the software underneath it. The
 *      carrier appears on the RESULT card once a shipment resolves (see showCarrier in
 *      tracking-view.tsx).
 *   2. The support band is real or absent. It is driven by Platform's own fields and disappears
 *      when they are empty — this page will never print a number nobody answers. This is the one
 *      place platform-level contact is legitimate: there is no carrier yet to escalate to.
 */

/** Restores whatever the platform row held, so these tests do not leak into the others. */
async function withSupport(
  data: { supportPhone?: string | null; supportWhatsapp?: string | null; supportEmail?: string | null; supportHours?: string | null },
  run: () => Promise<void>
) {
  const before = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });
  await prisma.platform.update({ where: { id: PLATFORM_ID }, data });
  try {
    await run();
  } finally {
    await prisma.platform.update({
      where: { id: PLATFORM_ID },
      data: {
        supportPhone: before.supportPhone,
        supportWhatsapp: before.supportWhatsapp,
        supportEmail: before.supportEmail,
        supportHours: before.supportHours,
      },
    });
  }
}

test.describe("The unbranded fallback carries nobody's brand", () => {
  test("hero and the help disclosure are present without a session, and no brand is borrowed", async ({ page }) => {
    const platform = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });

    await page.context().clearCookies();
    await page.goto("/track");

    // A visitor here cannot say which carrier holds their goods — that is what the form asks. So
    // the bar states the page's purpose rather than borrowing an identity that does not apply.
    // Chargee's own name in particular must not appear: this is a white-label product, and the
    // platform underneath is not the company the customer has a relationship with.
    await expect(page.locator(`text=${platform.name}`)).toHaveCount(0);
    await expect(visibleText(page, "تتبّع شحنة").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "تتبّع شحنتك" })).toBeVisible();

    // The one question this form gets asked, answered in place. Closed by default so it costs
    // nothing to everyone who already knows their number.
    const help = page.getByText("أين تجد رقم الشحنة؟");
    await expect(help).toBeVisible();
    await expect(page.locator("text=يبدأ بـ SH")).toBeHidden();
    await help.click();
    await expect(visibleText(page, "يبدأ بـ SH").first()).toBeVisible();

    await cleanup();
  });

  test("the field glyph never sits on top of the value", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/track");
    await page.fill('input[name="shipmentNumber"]', "SH-100482");

    // The input is dir="ltr" inside an RTL page, so `padding-inline-start` resolves against the
    // input, not the page — the first pass reserved the gap on the wrong side and printed the icon
    // straight through the value. Asserted on the resolved box, not on the class that sets it.
    const box = await page.locator('input[name="shipmentNumber"]').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { left: cs.paddingLeft, right: cs.paddingRight };
    });
    expect(parseFloat(box.right)).toBeGreaterThan(parseFloat(box.left) + 20);

    await cleanup();
  });
});

test.describe("Support contact is real or absent", () => {
  test("a configured platform shows dialable, mailable rows", async ({ page }) => {
    await withSupport(
      {
        supportPhone: "+967771234567",
        supportWhatsapp: "+967771234567",
        supportEmail: "support@example.com",
        supportHours: "من 8 ص إلى 10 م",
      },
      async () => {
        await page.context().clearCookies();
        await page.goto("/track");

        await expect(visibleText(page, "لم تجد شحنتك؟ تواصل معنا").first()).toBeVisible();
        await expect(page.getByRole("link", { name: /967 771 234 567/ }).first()).toHaveAttribute(
          "href",
          "tel:+967771234567"
        );
        // wa.me takes digits only — the one place the normalised number is deliberately unformatted.
        await expect(page.locator('a[href="https://wa.me/967771234567"]')).toBeVisible();
        await expect(page.locator('a[href="mailto:support@example.com"]')).toBeVisible();
        await expect(visibleText(page, "من 8 ص إلى 10 م").first()).toBeVisible();
      }
    );
    await cleanup();
  });

  test("an unconfigured platform shows no band at all, not an empty one", async ({ page }) => {
    await withSupport(
      { supportPhone: null, supportWhatsapp: null, supportEmail: null, supportHours: null },
      async () => {
        await page.context().clearCookies();
        await page.goto("/track");

        await expect(page.locator("text=لم تجد شحنتك؟ تواصل معنا")).toHaveCount(0);
        // The page still does its job — the band is decoration around the form, never the form.
        await expect(page.getByRole("button", { name: /تتبّع الشحنة/ })).toBeVisible();
      }
    );
    await cleanup();
  });

  test("a support number that cannot be dialled is refused at the settings form", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const before = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });

    await login(page, admin.email);
    await page.goto("/platform/settings");
    await page.fill('input[name="supportPhone"]', "123");
    await page.getByRole("button", { name: /حفظ/ }).first().click();

    await expect(visibleText(page, "رقم الدعم").first()).toBeVisible();
    const after = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });
    // A published support line that nobody answers is worse than none, so nothing was written.
    expect(after.supportPhone).toBe(before.supportPhone);

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("clearing the fields empties them to NULL rather than to an empty string", async ({ page }) => {
    const admin = await createTestPlatformAdmin();

    await withSupport({ supportPhone: "+967771234567", supportEmail: "a@b.co" }, async () => {
      await login(page, admin.email);
      await page.goto("/platform/settings");
      await page.fill('input[name="supportPhone"]', "");
      await page.fill('input[name="supportEmail"]', "");
      await page.getByRole("button", { name: /حفظ/ }).first().click();
      await expect(visibleText(page, "تم حفظ الإعدادات").first()).toBeVisible();

      const after = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });
      // /track tests the value itself to decide whether to render the band; "" would keep an empty
      // row on a customer-facing page.
      expect(after.supportPhone).toBeNull();
      expect(after.supportEmail).toBeNull();
    });

    await prisma.user.delete({ where: { id: admin.userId } });
  });
});

/** No tenant is created by most of these, so there is nothing to tear down — kept as a single
 *  no-op seam so every test reads the same way. */
async function cleanup() {}
