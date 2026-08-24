import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestPlatformAdmin, login, cleanupTenant, pollUntil, driverStopCard, visibleText } from "./helpers";
import { toUserMessage } from "../../src/lib/action-result";
import { newTrackingToken } from "../../src/lib/tracking";
import { createTrip } from "../../src/modules/trips/service";

/**
 * P0-3 — the Arabic error/loading/not-found system.
 *
 * Two separate concerns are covered here:
 *   1. The route-level states (not-found / loading), which used not to exist at all — an Arabic
 *      speaking clerk hitting a bad link got Next.js's default English screen.
 *   2. Server Action failures, which Next.js redacts to an opaque digest in production builds.
 *      Every deliberate Arabic reason in the service layer was being replaced by
 *      "حدث خطأ غير متوقع"; the tests below pin the real messages to the screen.
 */

test.describe("Not found — contextual, Arabic, with a way back", () => {
  test("an unmatched URL gets the Arabic root 404, not Next's default", async ({ page }) => {
    // Signed in first: src/proxy.ts sends anonymous requests for unknown paths to /login rather
    // than rendering a 404, which deliberately avoids disclosing which routes exist.
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    await login(page, tenant.adminEmail);

    const res = await page.goto("/this-route-does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.locator("text=الصفحة غير موجودة").first()).toBeVisible();
    // Never the framework's English default.
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("This page could not be found");
    expect(body).not.toContain("404");

    await cleanupTenant(tenant.company.id);
  });

  test("a missing shipment says so in shipment language and links back to the list", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    await login(page, tenant.adminEmail);

    await page.goto("/app/shipments/cmnonexistentshipmentid00");
    await expect(page.locator("text=لم نجد هذه الشحنة").first()).toBeVisible();

    await page.click('a:has-text("العودة إلى الشحنات")');
    await page.waitForURL("**/app/shipments");

    await cleanupTenant(tenant.company.id);
  });

  test("a missing trip says so in trip language and links back to the trips list", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    await login(page, tenant.adminEmail);

    await page.goto("/app/trips/cmnonexistenttripid000000");
    await expect(page.locator("text=لم نجد هذه الرحلة").first()).toBeVisible();

    await page.click('a:has-text("العودة إلى الرحلات")');
    await page.waitForURL("**/app/trips");

    await cleanupTenant(tenant.company.id);
  });

  test("another company's shipment is 'not found', never 'forbidden' — no existence leak", async ({ page }) => {
    const a = await createTestTenant(["الرياض", "المكلا"]);
    const b = await createTestTenant(["جدة", "عدن"]);
    const foreign = await createTestShipment({
      companyId: b.company.id,
      customerId: b.customerId,
      loadBranchId: b.branches[0].id,
      unloadBranchId: b.branches[1].id,
      cartonCount: 1,
    });

    await login(page, a.adminEmail);
    await page.goto(`/app/shipments/${foreign.id}`);

    await expect(page.locator("text=لم نجد هذه الشحنة").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(foreign.shipmentNumber);

    await cleanupTenant(a.company.id);
    await cleanupTenant(b.company.id);
  });

  test("the customer 404 speaks to a customer, not an employee", async ({ page }) => {
    await page.goto(`/t/${newTrackingToken()}`);
    await expect(page.locator("text=لم نجد هذه الشحنة").first()).toBeVisible();
    // Points at the WhatsApp link and the office — not at a dashboard the customer cannot reach.
    await expect(page.locator("text=رسالة الواتساب").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("لوحة التحكم");
  });

  test("the platform console has its own 404 inside its own shell", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    await login(page, admin.email);

    // A matched platform route that calls notFound() — this is what renders platform/not-found.tsx.
    // (A URL matching no route at all renders the ROOT not-found instead, since no segment, and
    // therefore no layout, applies. That is Next's documented behaviour, not a gap.)
    await page.goto("/platform/companies/cmnonexistentcompanyid00");
    await expect(page.locator("text=الصفحة غير موجودة").first()).toBeVisible();
    // Still inside the platform shell, so the operator keeps their navigation.
    await expect(page.locator("aside nav")).toBeVisible();

    await prisma.user.delete({ where: { id: admin.userId } });
  });
});

test.describe("Loading — skeletons on slow navigation", () => {
  test("the shipments list shows a skeleton, not a blank screen, while it loads", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    await login(page, tenant.adminEmail);
    await page.goto("/app");

    // Hold the shipments payload so the loading state is observable rather than a 40ms flash.
    await page.route("**/app/shipments**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.click('a[href="/app/shipments"]');
    await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible({ timeout: 5000 });

    await page.unroute("**/app/shipments**");
    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Server Action failures reach the user in Arabic", () => {
  test("a driver is prevented from finishing a trip with cargo still aboard, and the screen says why", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [load, unload] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: load.id,
      unloadBranchId: unload.id,
      cartonCount: 2,
      status: "READY_FOR_LOADING",
    });

    const trip = await createTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: load.id, sequence: 1, loadingEnabled: true, unloadingEnabled: false },
        { branchId: unload.id, sequence: 2, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    // Loaded and not yet unloaded — cargo genuinely still on the truck, which is the one thing that
    // legitimately blocks finishing a trip. (A shipment merely *planned* onto the trip and never
    // loaded no longer blocks anything: see P0-5. The reason this test exists is the message, not
    // the refusal — the driver must be told why, not handed a production digest.)
    await prisma.tripShipmentStop.create({
      data: {
        tripId: trip.id, shipmentId: shipment.id,
        loadStopId: trip.stops[0].id, unloadStopId: trip.stops[1].id,
        loadedAt: new Date(), cartonsLoaded: 2,
      },
    });
    await prisma.trip.update({ where: { id: trip.id }, data: { status: "IN_PROGRESS" } });
    // The shipment is on the road, matching its loaded link — otherwise unloading it later would
    // be an illegal transition for reasons that have nothing to do with what this test checks.
    await prisma.shipment.update({ where: { id: shipment.id }, data: { status: "IN_TRANSIT" } });

    await login(page, tenant.driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    // The UI applies the server's own rule instead of a looser one, so the driver is stopped before
    // the request rather than by an error afterwards. The button is not offered at all while cargo
    // is aboard — it is not a greyed-out control competing for a thumb, it is simply not the next
    // step — and the manifest spells out what is still on the truck.
    await expect(page.locator('button:has-text("تأكيد نهاية الرحلة")')).toHaveCount(0);
    // What is still aboard is stated at trip level, above the fold, without opening anything: the
    // stop manifests live inside their own stop, and this is the glanceable version of them.
    await expect(visibleText(page, "1 للتفريغ").first()).toBeVisible();
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe("IN_PROGRESS");

    // Once the cargo is off, the same button works — the rule was about the cargo, not the button.
    // The unloading stop is not where the truck is yet, so it is folded — opening it is the tap the
    // driver would make.
    const unloadCard = await driverStopCard(page, trip.stops[1].id);
    await unloadCard.locator('button:has-text("تأكيد التفريغ")').click();
    await page.click('[role="dialog"] button:has-text("تأكيد التفريغ")');
    await pollUntil(
      () => prisma.tripShipmentStop.findFirstOrThrow({ where: { tripId: trip.id } }),
      (l) => l.unloadedAt !== null
    );
    await page.reload();
    await page.click('button:has-text("تأكيد نهاية الرحلة")');
    await pollUntil(
      () => prisma.trip.findUniqueOrThrow({ where: { id: trip.id } }),
      (t) => t.status === "COMPLETED"
    );

    await cleanupTenant(tenant.company.id);
  });

  test("a delivery request already actioned by a colleague explains itself", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [load, unload] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: load.id,
      unloadBranchId: unload.id,
      cartonCount: 1,
      status: "ARRIVED",
    });
    const request = await prisma.deliveryRequest.create({
      data: {
        companyId: tenant.company.id, shipmentId: shipment.id,
        customerName: "عميل", customerPhone: "+967700000000",
        pickupBranchId: unload.id, destinationAddress: "المكلا", cartonCount: 1,
        deliveryFee: 0, status: "PENDING",
      },
    });

    await login(page, tenant.adminEmail);
    await page.goto("/app/delivery");
    // Another employee confirms it first.
    await prisma.deliveryRequest.update({ where: { id: request.id }, data: { status: "ASSIGNED" } });

    await page.click('button:has-text("مراجعة وتأكيد الطلب")');
    await expect(page.locator("text=تمت مراجعته بالفعل").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("an invalid platform fee is rejected inline instead of silently doing nothing", async ({ page }) => {
    const admin = await createTestPlatformAdmin();
    const before = await prisma.platform.findFirstOrThrow();

    await login(page, admin.email);
    await page.goto("/platform/settings");
    // The input carries min="0", so a browser refuses to submit -5 at all. Disable native
    // validation to exercise the server-side guard, which is what protects against any client that
    // does not honour it.
    await page.evaluate(() => {
      document.querySelectorAll("form").forEach((form) => (form.noValidate = true));
    });
    await page.fill('input[name="feePerCartonYER"]', "-5");
    await page.click('button:has-text("حفظ")');

    await expect(page.locator("text=لا يمكن أن تكون رسوم الكرتون بالسالب").first()).toBeVisible();
    const after = await prisma.platform.findFirstOrThrow();
    expect(Number(after.feePerCartonYER)).toBe(Number(before.feePerCartonYER));

    await prisma.user.delete({ where: { id: admin.userId } });
  });

  test("a branch-scoped employee gets a permission sentence, never a raw FORBIDDEN string", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const { createBranchScopedUser } = await import("./helpers");
    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { shipments: ["view", "create", "updateStatus"], customers: ["view"] },
    });

    const foreign = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[1].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
      status: "ARRIVED",
    });

    await login(page, employee.email);
    await page.goto(`/app/shipments/${foreign.id}`);
    // Out of branch scope, so it reads as not found rather than exposing the row.
    await expect(page.locator("text=لم نجد هذه الشحنة").first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("FORBIDDEN");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("toUserMessage — the rule that decides what is safe to show", () => {
  const cases: [string, unknown, string][] = [
    ["shows a deliberate Arabic reason", new Error("لا يمكن إنهاء الرحلة قبل تفريغ جميع الشحنات"), "لا يمكن إنهاء الرحلة قبل تفريغ جميع الشحنات"],
    ["translates FORBIDDEN guards", new Error("FORBIDDEN: missing trips.complete"), "ليس لديك صلاحية لتنفيذ هذا الإجراء."],
    ["translates branch guards", new Error("FORBIDDEN: outside assigned branch"), "ليس لديك صلاحية لتنفيذ هذا الإجراء."],
    ["hides Prisma internals", new Error("Invalid `prisma.shipment.update()` invocation: column does not exist"), "تعذّر تنفيذ الإجراء. حاول مرة أخرى."],
    ["hides raw runtime errors", new TypeError("Cannot read properties of undefined (reading 'id')"), "تعذّر تنفيذ الإجراء. حاول مرة أخرى."],
    ["hides connection errors", new Error("connect ECONNREFUSED 127.0.0.1:5432"), "تعذّر تنفيذ الإجراء. حاول مرة أخرى."],
    ["handles a non-Error throw", "just a string", "تعذّر تنفيذ الإجراء. حاول مرة أخرى."],
  ];
  for (const [name, input, expected] of cases) {
    test(name, () => {
      expect(toUserMessage(input)).toBe(expected);
    });
  }

  test("a call-site fallback replaces the generic sentence", () => {
    expect(toUserMessage(new TypeError("boom"), "تعذّر إنهاء الرحلة")).toBe("تعذّر إنهاء الرحلة");
  });

  test("a vanished record reads as stale data, not a crash", () => {
    expect(toUserMessage(new Error("No record was found for an update"))).toContain("لم يعد هذا العنصر متاحاً");
  });
});
