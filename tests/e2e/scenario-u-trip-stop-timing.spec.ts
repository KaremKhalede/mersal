import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestTrip, login, cleanupTenant } from "./helpers";
import { stopTiming, AT_RISK_MINUTES } from "../../src/lib/stop-timing";
import { businessLocalInputToDate, formatBusinessDateTime } from "../../src/lib/timezone";

const MIN = 60_000;

/** Phase 5 P1 batch 1, item 3 — deterministic on-time/at-risk/late trip stop signal. */
test.describe("Scenario U — trip stop on-time / at-risk / late", () => {
  test("stopTiming() rule: every branch of the deterministic classification", () => {
    const now = new Date("2026-01-01T12:00:00Z");

    // No plannedArrival at all -> insufficient data, no signal.
    expect(stopTiming(null, null, now)).toBeNull();

    // Not yet arrived, still before planned time -> on time.
    expect(stopTiming(new Date(now.getTime() + 10 * MIN), null, now)).toBe("ON_TIME");
    // Not yet arrived, exactly at planned time (diff == 0) -> on time.
    expect(stopTiming(new Date(now.getTime()), null, now)).toBe("ON_TIME");
    // Not yet arrived, 1 minute past planned -> at risk.
    expect(stopTiming(new Date(now.getTime() - 1 * MIN), null, now)).toBe("AT_RISK");
    // Not yet arrived, exactly at the at-risk boundary (30 min past) -> still at risk (<=).
    expect(stopTiming(new Date(now.getTime() - AT_RISK_MINUTES * MIN), null, now)).toBe("AT_RISK");
    // Not yet arrived, just past the boundary -> late.
    expect(stopTiming(new Date(now.getTime() - (AT_RISK_MINUTES + 1) * MIN), null, now)).toBe("LATE");

    // Arrived exactly on time or early -> on time, regardless of how early.
    expect(stopTiming(new Date(now.getTime()), new Date(now.getTime() - 60 * MIN), now)).toBe("ON_TIME");
    // Arrived even 1 minute late -> late outright, no "at risk" state once it's already happened.
    expect(stopTiming(new Date(now.getTime() - 1 * MIN), new Date(now.getTime()), now)).toBe("LATE");
    // Arrived well past planned -> late.
    expect(stopTiming(new Date(now.getTime() - 120 * MIN), new Date(now.getTime()), now)).toBe("LATE");
  });

  test("trip detail page shows the correct badge per stop, using the real plannedArrival/actualArrival data", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const now = Date.now();

    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false, plannedArrival: new Date(now + 60 * MIN) }, // on time (future, not arrived)
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true, plannedArrival: new Date(now - 10 * MIN) }, // at risk
        { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true, plannedArrival: new Date(now - 90 * MIN) }, // late
      ],
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    const stopA = page.locator(`[data-testid="stop-${trip.stops[0].id}"]`);
    const stopB = page.locator(`[data-testid="stop-${trip.stops[1].id}"]`);
    const stopC = page.locator(`[data-testid="stop-${trip.stops[2].id}"]`);

    await expect(stopA.locator("text=في الموعد")).toBeVisible();
    await expect(stopB.locator("text=في خطر التأخر")).toBeVisible();
    await expect(stopC.locator("text=متأخر")).toBeVisible();

    // Cross-checks: a stop must not show a different timing bucket's label.
    await expect(stopA.locator("text=متأخر")).toHaveCount(0);
    await expect(stopB.locator("text=متأخر")).toHaveCount(0);
    await expect(stopC.locator("text=في الموعد")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a stop with no plannedArrival shows no timing badge at all", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: branchB.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/trips/${trip.id}`);

    for (const label of ["في الموعد", "في خطر التأخر", "متأخر"]) {
      await expect(page.locator(`text=${label}`)).toHaveCount(0);
    }

    await cleanupTenant(tenant.company.id);
  });

  test("New Trip dialog can set a planned arrival time per stop, persisted to the real Trip", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;

    await login(page, tenant.adminEmail);
    await page.goto("/app/trips");
    await page.click('button:has-text("رحلة جديدة")');

    const stopRows = page.locator('[data-testid^="new-trip-stop-"]');
    const comboboxes = page.locator('[role="dialog"] button[role="combobox"]');
    await comboboxes.nth(1).click(); // stop 0's branch select (0 is the driver select)
    await page.locator(`[role="option"]:has-text("${branchA.name}")`).click();
    await comboboxes.nth(2).click(); // stop 1's branch select
    await page.locator(`[role="option"]:has-text("${branchB.name}")`).click();

    await stopRows.nth(0).locator('input[name="stopPlannedArrival"]').fill("2026-06-01T09:30");

    await page.click('[role="dialog"] button:has-text("إنشاء الرحلة")');
    await page.waitForURL(/\/app\/trips\//);

    const tripId = page.url().split("/trips/")[1];
    const stops = await prisma.tripStop.findMany({ where: { tripId }, orderBy: { sequence: "asc" } });
    // Fixed with a real business-timezone rule (src/lib/timezone.ts), not a test-only patch: the
    // server now interprets the datetime-local value as AST (UTC+3) explicitly, regardless of what
    // timezone the server process itself runs in — so the expected UTC instant is deterministic and
    // can be computed independently here (this is what the fix is actually for), not test-machine-
    // or server-machine-timezone-dependent like the naive `new Date(string)` parse used to be.
    expect(stops[0].plannedArrival?.getTime()).toBe(businessLocalInputToDate("2026-06-01T09:30")!.getTime());
    expect(stops[0].plannedArrival?.toISOString()).toBe("2026-06-01T06:30:00.000Z"); // 09:30 AST = 06:30 UTC
    expect(stops[1].plannedArrival).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("businessLocalInputToDate / formatBusinessDateTime round-trip AST correctly regardless of server timezone", () => {
    // 09:30 AST (UTC+3) is 06:30 UTC — true regardless of which timezone this assertion itself runs in.
    const utc = businessLocalInputToDate("2026-06-01T09:30");
    expect(utc?.toISOString()).toBe("2026-06-01T06:30:00.000Z");

    // "ar-SA" renders Arabic-Indic digits (٠٩:٣٠), consistent with the rest of this Arabic-first
    // app — not a bug, so assert the actual hour/minute components rather than a Latin-digit string.
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(utc!);
    expect(parts.find((p) => p.type === "hour")?.value).toBe("09");
    expect(parts.find((p) => p.type === "minute")?.value).toBe("30");
    expect(formatBusinessDateTime(utc!, { hour: "2-digit", minute: "2-digit", hour12: false })).toBe("٠٩:٣٠");

    expect(businessLocalInputToDate("")).toBeUndefined();
  });
});
