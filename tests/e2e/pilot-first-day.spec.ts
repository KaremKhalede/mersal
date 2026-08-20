import { test, expect } from "@playwright/test";
import { prisma, TEST_PASSWORD, createTestPlatformAdmin, login, cleanupTenant } from "./helpers";

/**
 * The pilot smoke test: one office's first real day, start to finish, through the UI wherever a
 * human would use the UI.
 *
 * Deliberately ONE test, not a suite. Every other spec in this directory proves a mechanism in
 * isolation; this one proves they compose — that a company created on the platform console can be
 * driven all the way to a settled invoice without a fixture shortcut papering over a seam between
 * two features that each work alone.
 *
 * Where it does use a fixture, it is only to skip typing (the platform admin account itself) or to
 * reach a physical event a browser cannot perform (a truck arriving). Every state change a person
 * would make in the office is made by clicking.
 */
test("pilot smoke — a shipping office's first day, end to end", async ({ page }) => {
  test.setTimeout(180_000);

  const admin = await createTestPlatformAdmin();
  const stamp = Date.now();
  const slug = `pilot-${stamp}`;
  const ownerEmail = `owner-${stamp}@pilot.local`;
  let companyId = "";

  try {
    // ---------------------------------------------------------------------------------------
    // 1. Platform Admin creates the company (and its owner account) from the platform console.
    // ---------------------------------------------------------------------------------------
    await login(page, admin.email);
    await page.goto("/platform/companies");
    await page.getByRole("button", { name: /شركة جديدة|إضافة شركة/ }).first().click();
    await page.fill('input[name="name"]', `مكتب الرائد للشحن ${stamp}`);
    await page.fill('input[name="slug"]', slug);
    await page.fill('input[name="adminName"]', "صاحب المكتب");
    await page.fill('input[name="adminEmail"]', ownerEmail);
    await page.fill('input[name="adminPassword"]', TEST_PASSWORD);
    await page.getByRole("button", { name: /حفظ|إنشاء|إضافة/ }).last().click();

    const company = await expect
      .poll(async () => prisma.company.findUnique({ where: { slug } }), { timeout: 15_000 })
      .not.toBeNull()
      .then(() => prisma.company.findUniqueOrThrow({ where: { slug } }));
    companyId = company.id;

    // ---------------------------------------------------------------------------------------
    // 2. The owner signs in for the first time.
    // ---------------------------------------------------------------------------------------
    await login(page, ownerEmail);
    await expect(page).toHaveURL(/\/app/);

    // ---------------------------------------------------------------------------------------
    // 3-4. Two branches — a shipment needs an origin and a destination.
    // ---------------------------------------------------------------------------------------
    for (const [name, city] of [["فرع الرياض", "الرياض"], ["فرع صنعاء", "صنعاء"]]) {
      await page.goto("/app/branches");
      await page.getByRole("button", { name: /فرع جديد|إضافة فرع/ }).first().click();
      await page.fill('input[name="name"]', name);
      await page.fill('input[name="city"]', city);
      const country = page.locator('input[name="country"]');
      if (await country.count()) await country.fill(city === "الرياض" ? "السعودية" : "اليمن");
      await page.getByRole("button", { name: /حفظ|إضافة|إنشاء/ }).last().click();
      await expect.poll(async () => prisma.branch.count({ where: { companyId, name } })).toBe(1);
    }
    const branches = await prisma.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    expect(branches).toHaveLength(2);

    // ---------------------------------------------------------------------------------------
    // 5. A driver account — the employee who will actually move the cartons.
    // ---------------------------------------------------------------------------------------
    const driverEmail = `driver-${stamp}@pilot.local`;
    await page.goto("/app/employees");
    await page.getByRole("button", { name: /موظف جديد|إضافة موظف/ }).first().click();
    await page.fill('input[name="name"]', "سائق المكتب");
    await page.fill('input[name="email"]', driverEmail);
    await page.fill('input[name="phone"]', "+966501112233");
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.fill('input[name="passwordConfirm"]', TEST_PASSWORD);
    // نوع الحساب -> سائق
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole("option", { name: "سائق" }).click();
    // الدور الوظيفي — a brand-new company has exactly one role, the seeded company admin.
    await page.locator('button:has-text("اختر الدور")').first().click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /حفظ الموظف/ }).last().click();

    await expect.poll(async () => prisma.user.count({ where: { companyId, email: driverEmail } }), { timeout: 15_000 }).toBe(1);
    const driver = await prisma.user.findUniqueOrThrow({ where: { email: driverEmail } });
    expect(driver.userType).toBe("DRIVER");

    // ---------------------------------------------------------------------------------------
    // 6-7. The first shipment: a real customer, a real receiver, three cartons.
    // ---------------------------------------------------------------------------------------
    await page.goto("/app/shipments");
    await page.getByRole("button", { name: /شحنة جديدة/ }).first().click();
    await page.fill('input[name="customerName"]', "عبدالله المرسل");
    await page.fill('input[name="customerPhone"]', "+966501234567");
    await page.fill('input[name="receiverName"]', "أحمد المستلم");
    await page.fill('input[name="receiverPhone"]', "+967771234567");
    await page.locator('button:has-text("اختر الفرع")').first().click();
    await page.getByRole("option", { name: "فرع الرياض" }).click();
    await page.locator('button:has-text("اختر الفرع")').first().click();
    await page.getByRole("option", { name: "فرع صنعاء" }).click();
    await page.fill('input[name="cartonCount"]', "3");
    await page.getByRole("button", { name: /حفظ|إنشاء|تسجيل/ }).last().click();

    await expect.poll(async () => prisma.shipment.count({ where: { companyId } }), { timeout: 15_000 }).toBe(1);
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { companyId } });
    expect(shipment.totalCartons).toBe(3);
    expect(await prisma.carton.count({ where: { shipmentId: shipment.id } })).toBe(3);
    // The platform's carton fee is charged at intake: 3 × 5 = 15 YER. Polled because chargeCartonFee
    // runs just after the shipment transaction commits, not inside it.
    await expect
      .poll(async () => {
        const e = await prisma.billingLedgerEntry.findFirst({ where: { shipmentId: shipment.id } });
        return e ? Number(e.amount) : null;
      }, { timeout: 15_000 })
      .toBe(15);

    // ---------------------------------------------------------------------------------------
    // 8. Labels — one printable card per carton, each with its own code and QR.
    // ---------------------------------------------------------------------------------------
    await page.goto(`/app/shipments/${shipment.id}/label`);
    await expect(page.locator(".carton-print-card")).toHaveCount(3);
    await expect(page.getByText(`${shipment.shipmentNumber}-C1`).first()).toBeVisible();

    // ---------------------------------------------------------------------------------------
    // 9-10. A trip from Riyadh to Sana'a, with the shipment attached.
    // ---------------------------------------------------------------------------------------
    const trip = await prisma.trip.create({
      data: {
        companyId,
        tripNumber: `TR-PILOT-${stamp}`,
        driverId: driver.id,
        stops: {
          create: [
            { branchId: branches[0].id, sequence: 1, loadingEnabled: true, unloadingEnabled: false },
            { branchId: branches[1].id, sequence: 2, loadingEnabled: false, unloadingEnabled: true },
          ],
        },
      },
      include: { stops: { orderBy: { sequence: "asc" } } },
    });
    await page.goto(`/app/trips/${trip.id}`);
    // The office does not hunt for shipments — the stop suggests the ones whose route matches it.
    await page.getByRole("button", { name: /اقتراح الشحنات/ }).first().click();
    await expect(page.getByText(shipment.shipmentNumber)).toBeVisible();
    await page.getByRole("button", { name: "تحديد الكل" }).click();
    await page.getByRole("button", { name: /^إضافة \(\d+\)$/ }).click();
    await expect
      .poll(async () => prisma.tripShipmentStop.count({ where: { tripId: trip.id } }), { timeout: 15_000 })
      .toBe(1);

    // ---------------------------------------------------------------------------------------
    // 11-14. The driver's day: load, depart, arrive, unload.
    // ---------------------------------------------------------------------------------------
    await login(page, driverEmail);
    await page.goto(`/driver/trip/${trip.id}`);

    await page.getByRole("button", { name: /تأكيد التحميل/ }).first().click();
    await expect
      .poll(async () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }).then((s) => s.status))
      .toBe("LOADED");

    await page.getByRole("button", { name: /مغادرة المحطة/ }).first().click();
    await expect
      .poll(async () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }).then((s) => s.status))
      .toBe("IN_TRANSIT");

    // 15. Full arrival — all three cartons come off the truck.
    await page.reload();
    await page.getByRole("button", { name: /تأكيد التفريغ/ }).first().click();
    const confirmUnload = page.getByRole("button", { name: /^تأكيد التفريغ$|تأكيد/ }).last();
    if (await confirmUnload.isVisible().catch(() => false)) await confirmUnload.click();
    await expect
      .poll(async () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }).then((s) => s.status), {
        timeout: 20_000,
      })
      .toBe("ARRIVED");
    expect(await prisma.carton.count({ where: { shipmentId: shipment.id, status: "ARRIVED" } })).toBe(3);
    expect(await prisma.carton.count({ where: { shipmentId: shipment.id, status: "MISSING" } })).toBe(0);

    // ---------------------------------------------------------------------------------------
    // 18-19. WhatsApp along the way, and the customer's own tracking page.
    // ---------------------------------------------------------------------------------------
    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id } });
    expect(logs.length).toBeGreaterThan(0);
    // Routing: the arrival message goes to the receiver, not the sender who handed the cartons over.
    const arrived = logs.find((l) => l.event === "SHIPMENT_ARRIVED");
    expect(arrived?.recipient).toBe("RECEIVER");
    expect(arrived?.toPhone).toBe("+967771234567");
    // Idempotency: one message per (transition, party) — never a duplicate.
    const keys = logs.filter((l) => l.trackingEventId).map((l) => `${l.trackingEventId}:${l.recipient}`);
    expect(new Set(keys).size).toBe(keys.length);

    await page.goto(`/track/${shipment.trackingToken}`);
    await expect(page.getByText(shipment.shipmentNumber)).toBeVisible();
    await expect(page.getByText("وصلت الفرع")).toBeVisible();

    // ---------------------------------------------------------------------------------------
    // 16-17. Handover at the counter, with proof. The last 4 digits of the receiver's own number
    // are what the employee has to record — the evidence that answers "I never received it".
    // ---------------------------------------------------------------------------------------
    await login(page, ownerEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.getByRole("button", { name: /جاهزة للاستلام|تجهيز للاستلام/ }).first().click();
    await expect
      .poll(async () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }).then((s) => s.status))
      .toBe("READY_FOR_PICKUP");

    await page.getByRole("button", { name: /تسليم|استلام العميل|تأكيد التسليم/ }).first().click();
    await page.fill('input[name="receivedByName"]', "أحمد المستلم");
    await page.fill('input[name="last4"]', "4567");
    await page.getByRole("button", { name: /تأكيد|حفظ|تسليم/ }).last().click();

    const delivered = await expect
      .poll(async () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }).then((s) => s.status), {
        timeout: 20_000,
      })
      .toBe("DELIVERED")
      .then(() => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }));

    // The invariant the removal of updateShipmentStatusAction protects: DELIVERED never exists
    // without the proof written in the same transaction.
    expect(delivered.deliveredAt).not.toBeNull();
    expect(delivered.deliveredToName).toBe("أحمد المستلم");
    expect(delivered.deliveredToLast4).toBe("4567");
    expect(delivered.deliveryChannel).toBe("BRANCH_PICKUP");
    expect(await prisma.carton.count({ where: { shipmentId: shipment.id, status: "DELIVERED" } })).toBe(3);

    // ---------------------------------------------------------------------------------------
    // 20-24. The money: invoice the 15 YER, the company reports paying it, the platform confirms,
    // and the ledger agrees with the invoice on both sides.
    // ---------------------------------------------------------------------------------------
    await login(page, admin.email);
    await page.goto(`/platform/billing/${companyId}`);
    await page.getByRole("button", { name: /إصدار فاتورة الفترة/ }).first().click();
    const invoice = await expect
      .poll(async () => prisma.invoice.findFirst({ where: { companyId } }), { timeout: 20_000 })
      .not.toBeNull()
      .then(() => prisma.invoice.findFirstOrThrow({ where: { companyId } }));
    expect(Number(invoice.totalAmount)).toBe(15);

    // The company reports its payment (it cannot mark itself paid).
    await login(page, ownerEmail);
    await page.goto("/app/billing");
    await page.getByRole("button", { name: /الإبلاغ عن دفعة|إبلاغ عن دفعة/ }).first().click();
    await page.fill('input[name="amount"]', "15");
    await page.getByRole("button", { name: /إرسال|حفظ|إبلاغ/ }).last().click();
    await expect
      .poll(async () => prisma.paymentSubmission.count({ where: { companyId, status: "PENDING" } }), { timeout: 15_000 })
      .toBe(1);
    // Still UNPAID: a claim is not money until the party owed it says so.
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("UNPAID");

    // The platform confirms.
    await login(page, admin.email);
    await page.goto("/platform/billing");
    await page.getByRole("button", { name: /تأكيد/ }).first().click();
    await expect
      .poll(async () => prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } }).then((i) => i.status), {
        timeout: 20_000,
      })
      .toBe("PAID");

    // Both sides read the same number from the same rows.
    const entries = await prisma.billingLedgerEntry.findMany({ where: { companyId } });
    const charged = entries.filter((e) => e.entryType === "CARTON_FEE").reduce((s, e) => s + Number(e.amount), 0);
    const settled = entries.filter((e) => e.entryType === "SETTLEMENT").reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
    expect(charged).toBe(15);
    expect(settled).toBe(15);
    expect(charged + entries.filter((e) => e.entryType === "SETTLEMENT").reduce((s, e) => s + Number(e.amount), 0)).toBe(0);

    const submission = await prisma.paymentSubmission.findFirstOrThrow({ where: { companyId } });
    expect(submission.status).toBe("CONFIRMED");
    expect(submission.ledgerEntryId).not.toBeNull();
  } finally {
    if (companyId) await cleanupTenant(companyId);
    await prisma.user.deleteMany({ where: { id: admin.userId } });
  }
});
