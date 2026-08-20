import { test, expect } from "@playwright/test";
import bcrypt from "bcryptjs";
import {
  prisma,
  TEST_PASSWORD,
  createTestTenant,
  createTestPlatformAdmin,
  createBranchScopedUser,
  createTestShipment,
  createTestTrip,
  linkShipmentToTrip,
  login,
  cleanupTenant,
} from "./helpers";
import { csvEscape } from "../../src/lib/csv";
import { saveDocument } from "../../src/modules/documents/service";
import { confirmPaymentSubmission, submitPayment, generateInvoice } from "../../src/modules/billing/service";
import { requestDeliveryFromCustomer } from "../../src/modules/delivery/service";
import { globalSearch } from "../../src/modules/reports/service";
import { createPasswordReset, completePasswordReset, resolvePasswordReset } from "../../src/modules/users/password-reset";
import { cancelDraftShipment } from "../../src/modules/shipments/service";
import { assertDriverTripStop } from "../../src/modules/trips/service";

/**
 * The pilot-hardening batch: one regression per fix that was made to get a real shipping office in
 * front of this product. Every test here is written against the *mechanism*, not the screen — these
 * are the guarantees that must not quietly come undone in a later refactor.
 */

test.describe("Suspended company is actually suspended", () => {
  test("a suspended tenant's employee cannot sign in, and a signed-in session stops working", async ({ page }) => {
    const tenant = await createTestTenant();

    // Baseline: the account works while the company is ACTIVE.
    await login(page, tenant.adminEmail);
    await expect(page).toHaveURL(/\/app/);

    await prisma.company.update({ where: { id: tenant.company.id }, data: { status: "SUSPENDED" } });

    // The existing session must die too, not just future logins — Company.status is re-read on
    // every request through getCurrentUser(), so no 30-day JWT outlives the suspension.
    await page.goto("/app/shipments");
    await expect(page).toHaveURL(/\/login/);

    // And a fresh login is refused, with the real reason rather than "wrong credentials" — the
    // employee needs to know to call the office, not to keep retrying a password that is correct.
    await page.fill('input[name="email"]', tenant.adminEmail);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page.getByText("حساب الشركة موقوف")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a platform admin keeps full access to a suspended company", async ({ page }) => {
    const tenant = await createTestTenant();
    const admin = await createTestPlatformAdmin();
    await prisma.company.update({ where: { id: tenant.company.id }, data: { status: "SUSPENDED" } });

    // Reviewing its billing and switching it back on is the entire point of suspending it.
    await login(page, admin.email);
    await page.goto(`/platform/companies/${tenant.company.id}`);
    await expect(page.getByText(tenant.company.name).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
    await prisma.user.deleteMany({ where: { id: admin.userId } });
  });
});

test.describe("Driver stop actions are bound to the driver's own trip", () => {
  test("a driver cannot confirm unload on a stop belonging to another company's trip", async () => {
    const victim = await createTestTenant();
    const attacker = await createTestTenant();

    // The victim: a real shipment loaded onto a real trip, waiting to be unloaded.
    const shipment = await createTestShipment({
      companyId: victim.company.id,
      customerId: victim.customerId,
      loadBranchId: victim.branches[0].id,
      unloadBranchId: victim.branches[1].id,
      cartonCount: 3,
      status: "IN_TRANSIT",
    });
    const victimTrip = await createTestTrip({
      companyId: victim.company.id,
      driverId: victim.driverId,
      stops: [
        { branchId: victim.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: victim.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const link = await linkShipmentToTrip(victimTrip.id, shipment.id, victimTrip.stops[0].id, victimTrip.stops[1].id);
    await prisma.tripShipmentStop.update({ where: { id: link.id }, data: { loadedAt: new Date() } });

    // The attacker: a driver of a different company, with a trip of their own, who has somehow
    // learned the victim's stop id. They pass their OWN tripId (which passes the ownership check)
    // together with the victim's stopId — the exact shape the old code accepted.
    const attackerTrip = await createTestTrip({
      companyId: attacker.company.id,
      driverId: attacker.driverId,
      stops: [
        { branchId: attacker.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: attacker.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });

    // The guard the three driver actions now run before touching anything. Called directly: the UI
    // would never offer this combination, so the only honest way to exercise it is the boundary.
    await expect(assertDriverTripStop(attacker.driverId, attackerTrip.id, victimTrip.stops[1].id)).rejects.toThrow(
      /المحطة لا تنتمي لهذه الرحلة/
    );
    // Passing the victim's trip id instead is refused one step earlier, by ownership.
    await expect(assertDriverTripStop(attacker.driverId, victimTrip.id, victimTrip.stops[1].id)).rejects.toThrow(
      /ليست ضمن رحلاتك/
    );
    // The driver's own stop on their own trip still resolves — the guard restricts, it doesn't block.
    await expect(assertDriverTripStop(attacker.driverId, attackerTrip.id, attackerTrip.stops[1].id)).resolves.toBeTruthy();

    // And nothing about the victim's shipment moved.
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.status).toBe("IN_TRANSIT");
    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id } });
    expect(cartons.every((c) => c.status !== "MISSING")).toBe(true);
    const stillOpen = await prisma.tripShipmentStop.findUniqueOrThrow({ where: { id: link.id } });
    expect(stillOpen.unloadedAt).toBeNull();

    await cleanupTenant(victim.company.id);
    await cleanupTenant(attacker.company.id);
  });
});

test.describe("Document uploads reject executable types", () => {
  async function upload(companyId: string, name: string, type: string, size = 32) {
    const file = new File([new Uint8Array(size)], name, { type });
    return saveDocument({ companyId, docType: "OTHER", file });
  }

  test("HTML and SVG are refused; PDF and images are accepted", async () => {
    const tenant = await createTestTenant();

    // The whole reason this whitelist exists: an .html or .svg served back on the app's own origin
    // is script the uploader gets to run as whoever opens it.
    await expect(upload(tenant.company.id, "x.html", "text/html")).rejects.toThrow(/صيغة الملف غير مدعومة/);
    await expect(upload(tenant.company.id, "x.svg", "image/svg+xml")).rejects.toThrow(/صيغة الملف غير مدعومة/);
    // A disguised extension does not help — the MIME type is what is checked.
    await expect(upload(tenant.company.id, "x.pdf", "text/html")).rejects.toThrow(/صيغة الملف غير مدعومة/);

    const ok = await upload(tenant.company.id, "فاتورة.pdf", "application/pdf");
    expect(ok.filePath.endsWith(".pdf")).toBe(true);
    // Stored under an extension this module assigned, never the uploaded filename — that is what
    // lets the download route derive a Content-Type it can prove matches what was validated.
    expect(ok.filePath.startsWith(`${tenant.company.id}/doc-`)).toBe(true);
    expect(ok.fileName).toBe("فاتورة.pdf");

    await expect(upload(tenant.company.id, "big.pdf", "application/pdf", 11 * 1024 * 1024)).rejects.toThrow(/يتجاوز 10 ميجابايت/);

    await cleanupTenant(tenant.company.id);
  });

  test("the download route serves attachment + nosniff, never inline", async ({ page }) => {
    const tenant = await createTestTenant();
    const doc = await upload(tenant.company.id, "proof.png", "image/png");

    await login(page, tenant.adminEmail);
    const res = await page.request.get(`/api/documents/${doc.id}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["content-disposition"]).toContain("attachment");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");

    await cleanupTenant(tenant.company.id);
  });

  test("a branch-scoped employee cannot download another branch's shipment document", async ({ page }) => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });
    const doc = await saveDocument({
      companyId: tenant.company.id,
      shipmentId: shipment.id,
      docType: "INVOICE",
      file: new File([new Uint8Array(8)], "inv.pdf", { type: "application/pdf" }),
    });

    // Pinned to a third branch the shipment never touches.
    const outsider = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[2].id,
      permissions: { documents: ["view", "upload"], shipments: ["view"] },
    });

    await login(page, outsider.email);
    const res = await page.request.get(`/api/documents/${doc.id}`);
    expect(res.status()).toBe(404);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Payment confirmation cannot double-credit an invoice", () => {
  test("two concurrent confirmations produce exactly one settlement", async () => {
    const tenant = await createTestTenant();
    await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 10, // 10 × 5 = 50 YER of carton fees
    });

    const invoice = await generateInvoice(tenant.company.id, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    expect(invoice).not.toBeNull();
    expect(invoice!.totalAmount).toBe(50);

    const submission = await submitPayment({
      companyId: tenant.company.id,
      invoiceId: invoice!.id,
      amount: 50,
      method: "BANK_TRANSFER",
    });

    // The double-click. Both calls read PENDING under the old read-then-write shape and both
    // appended a SETTLEMENT row; now the loser is refused before it reaches any money.
    const results = await Promise.allSettled([
      confirmPaymentSubmission(submission.id, tenant.adminId),
      confirmPaymentSubmission(submission.id, tenant.adminId),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const settlements = await prisma.billingLedgerEntry.findMany({
      where: { invoiceId: invoice!.id, entryType: "SETTLEMENT" },
    });
    expect(settlements).toHaveLength(1);
    expect(Number(settlements[0].amount)).toBe(-50);

    // Ledger and invoice state moved as one unit.
    const finalInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice!.id } });
    expect(finalInvoice.status).toBe("PAID");
    const finalSubmission = await prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submission.id } });
    expect(finalSubmission.status).toBe("CONFIRMED");
    expect(finalSubmission.ledgerEntryId).toBe(settlements[0].id);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Delivery requests carry the receiver, not the sender", () => {
  test("a customer-initiated request records the receiver's name and phone", async () => {
    const tenant = await createTestTenant();
    const sender = await prisma.customer.findUniqueOrThrow({ where: { id: tenant.customerId } });
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 2,
      status: "ARRIVED",
      receiverPhone: "+967771112222",
    });

    const request = await requestDeliveryFromCustomer({
      shipmentId: shipment.id,
      destinationAddress: "صنعاء — شارع الستين، بجوار المسجد",
    });

    // The courier is going to the receiver's address; the contact on the record has to be the
    // person at that address, not the sender who is in another country.
    expect(request.customerName).toBe(shipment.receiverName);
    expect(request.customerPhone).toBe("+967771112222");
    expect(request.customerPhone).not.toBe(sender.phone);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Global search respects branch scope", () => {
  test("a branch employee sees only their own branch's shipments in search results", async () => {
    const tenant = await createTestTenant();
    const mine = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });
    const theirs = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[2].id,
      unloadBranchId: tenant.branches[2].id,
      cartonCount: 1,
    });

    // Both shipments share a receiver name, so the query matches both and only scoping separates them.
    const scoped = await globalSearch(tenant.company.id, "مستلم اختبار", tenant.branches[0].id);
    const ids = scoped.shipments.map((s) => s.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(theirs.id);

    // A company-wide role (null scope) still sees everything — unchanged behaviour.
    const unscoped = await globalSearch(tenant.company.id, "مستلم اختبار", null);
    expect(unscoped.shipments.map((s) => s.id)).toEqual(expect.arrayContaining([mine.id, theirs.id]));

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("CSV exports are not formula injection vectors", () => {
  test("a leading =, +, - or @ is neutralized, ordinary values are untouched", () => {
    expect(csvEscape("=HYPERLINK(\"http://evil\",\"pay\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\",\"\"pay\"\")\"");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvEscape("-250")).toBe("'-250");
    // Arabic names, plain numbers and quoted-because-of-a-comma values keep working as before.
    expect(csvEscape("مؤسسة النور للشحن")).toBe("مؤسسة النور للشحن");
    expect(csvEscape("250.00")).toBe("250.00");
    expect(csvEscape("صنعاء, اليمن")).toBe("\"صنعاء, اليمن\"");
  });
});

test.describe("Password reset", () => {
  test("a token is single-use, expiring, and never stored in plaintext", async () => {
    const tenant = await createTestTenant();
    const { token } = await createPasswordReset(tenant.adminId);

    // The database holds a hash, not the token — a dump must not yield working links.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: tenant.adminId } });
    expect(row.resetTokenHash).not.toBe(token);
    expect(row.resetTokenHash).toHaveLength(64);
    expect(row.resetTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());

    expect(await resolvePasswordReset(token)).not.toBeNull();
    expect(await resolvePasswordReset("not-a-real-token")).toBeNull();

    await expect(completePasswordReset(token, "short")).rejects.toThrow(/8 أحرف على الأقل/);

    await completePasswordReset(token, "NewPassw0rd!");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: tenant.adminId } });
    expect(after.resetTokenHash).toBeNull();
    expect(await bcrypt.compare("NewPassw0rd!", after.passwordHash)).toBe(true);

    // Replay is refused: the token was burned in the same write that set the password.
    await expect(completePasswordReset(token, "AnotherPassw0rd!")).rejects.toThrow(/غير صالح/);

    await cleanupTenant(tenant.company.id);
  });

  test("an expired token resolves to nothing", async () => {
    const tenant = await createTestTenant();
    const { token } = await createPasswordReset(tenant.adminId);
    await prisma.user.update({
      where: { id: tenant.adminId },
      data: { resetTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(await resolvePasswordReset(token)).toBeNull();
    await cleanupTenant(tenant.company.id);
  });

  test("the reset page lets a locked-out employee set a new password and sign in", async ({ page }) => {
    const tenant = await createTestTenant();
    const { token } = await createPasswordReset(tenant.adminId);

    await page.goto(`/reset/${token}`);
    await page.fill('input[name="password"]', "Recovered1!");
    await page.fill('input[name="passwordConfirm"]', "Recovered1!");
    await page.click('button[type="submit"]');
    await expect(page.getByText("تم تعيين كلمة المرور")).toBeVisible();

    await login(page, tenant.adminEmail, "Recovered1!");
    await expect(page).toHaveURL(/\/app/);

    await cleanupTenant(tenant.company.id);
  });

  test("an invalid token shows the same neutral panel as a forged one", async ({ page }) => {
    await page.goto("/reset/definitely-not-a-token");
    await expect(page.getByText("هذا الرابط غير صالح أو انتهت صلاحيته")).toBeVisible();
    await expect(page.locator('input[name="password"]')).toHaveCount(0);
  });
});

test.describe("Cancelling at intake does not bill the office", () => {
  test("an un-invoiced carton fee is removed on cancel; an invoiced one is kept", async () => {
    const tenant = await createTestTenant();

    const cancelled = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 4,
      status: "REGISTERED",
    });
    await cancelDraftShipment(tenant.company.id, cancelled.id, { userId: tenant.adminId });

    expect(
      await prisma.billingLedgerEntry.count({ where: { shipmentId: cancelled.id, entryType: "CARTON_FEE" } })
    ).toBe(0);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: cancelled.id } })).status).toBe("CANCELLED");

    // Already billed: the company has been shown that number, so it stays. A refund there is a
    // conversation, not a silent delete — see reverseUnbilledCartonFee.
    const billed = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 2,
      status: "REGISTERED",
    });
    const invoice = await generateInvoice(tenant.company.id, new Date(Date.now() - 86_400_000), new Date(Date.now() + 86_400_000));
    await cancelDraftShipment(tenant.company.id, billed.id, { userId: tenant.adminId });

    const kept = await prisma.billingLedgerEntry.findFirstOrThrow({ where: { shipmentId: billed.id, entryType: "CARTON_FEE" } });
    expect(kept.invoiceId).toBe(invoice!.id);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Print page geometry is scoped to labels", () => {
  /** Every @page rule the document actually declares, in cascade order. */
  async function pageRules(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const out: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRule[];
        try {
          rules = Array.from(sheet.cssRules);
        } catch {
          continue; // cross-origin sheet, not ours
        }
        const walk = (list: CSSRule[]) => {
          for (const rule of list) {
            if (rule.constructor.name === "CSSPageRule" || rule.cssText.trimStart().startsWith("@page")) out.push(rule.cssText);
            const nested = (rule as CSSGroupingRule).cssRules;
            if (nested) walk(Array.from(nested));
          }
        };
        walk(rules);
      }
      return out;
    });
  }

  test("labels declare the thermal size; the manifest and invoice stay on A4", async ({ page }) => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 2,
    });
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      driverId: tenant.driverId,
      stops: [
        { branchId: tenant.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenant.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);

    await login(page, tenant.adminEmail);
    await page.emulateMedia({ media: "print" });

    // The label page ships its own @page override alongside the label UI.
    await page.goto(`/app/shipments/${shipment.id}/label`);
    expect((await pageRules(page)).join(" ")).toContain("100mm 150mm");

    // Everything else keeps the A4 default. This is the regression that mattered: @page is a
    // document-level rule, so declaring the thermal size globally silently forced the manifest,
    // the invoice and the shipments list onto a 100×150mm page.
    for (const path of [`/app/trips/${trip.id}/manifest`, "/app/shipments", "/app/billing"]) {
      await page.goto(path);
      // Chromium serializes the keyword lower-case ("size: a4"), hence the case-insensitive match.
      const rules = (await pageRules(page)).join(" ").toLowerCase();
      expect(rules).not.toContain("100mm");
      expect(rules).toContain("a4");
    }

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Password reset is reachable from the UI", () => {
  test("the employees row menu issues a link without ever showing a password", async ({ page }) => {
    const tenant = await createTestTenant();
    await login(page, tenant.adminEmail);
    await page.goto("/app/employees");

    // The dialog lives inside a DropdownMenuItem, which is exactly the arrangement that breaks
    // silently if the item's default select-and-close is not prevented — hence a UI-level check.
    await page.locator("table tbody tr").first().getByRole("button").last().click();
    await page.getByRole("button", { name: /إعادة تعيين كلمة المرور/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "إصدار الرابط" }).click();
    const field = page.locator("input[readonly]");
    await expect(field).toBeVisible();
    expect(await field.inputValue()).toContain("/reset/");

    await cleanupTenant(tenant.company.id);
  });
});
