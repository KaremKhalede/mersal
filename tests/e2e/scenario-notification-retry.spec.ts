import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createBranchScopedUser, login, cleanupTenant, pollUntil } from "./helpers";
import { dispatchShipmentEvent, retryNotification } from "@/modules/notifications/service";
import { notificationProvider } from "@/modules/notifications/provider";

/**
 * P1-4: a WhatsApp send that failed used to be the end of it — the customer simply never heard, and
 * the log row sat there with no way to act on it.
 *
 * Retry re-attempts the *existing* row rather than writing a new one, so unique(trackingEventId,
 * recipient) — the guarantee that one transition produces one message per party — is untouched.
 * These tests pin that the retryable set is exactly {FAILED}, that a retry cannot become a second
 * message, and that the outcome is recorded either way.
 */

const uniqEventId = (label: string) => `test-retry-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Runs a dispatch with the provider forced to reject, leaving a real FAILED row to act on. */
async function withFailingProvider<T>(error: string, run: () => Promise<T>): Promise<T> {
  const original = notificationProvider.send;
  notificationProvider.send = async () => ({ ok: false, error, retryable: true });
  try {
    return await run();
  } finally {
    notificationProvider.send = original;
  }
}

async function failedNotification(event: "SHIPMENT_RECEIVED" | "SHIPMENT_ARRIVED" = "SHIPMENT_RECEIVED", receiverPhone?: string) {
  const tenant = await createTestTenant();
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: tenant.branches[0].id,
    unloadBranchId: tenant.branches[1].id,
    cartonCount: 2,
    receiverPhone,
  });
  await withFailingProvider("provider rejected: temporary outage", () =>
    dispatchShipmentEvent(event, shipment.id, uniqEventId(event))
  );
  // Status is asserted by the callers that care: a receiver-routed event with an unusable number is
  // SKIPPED by design (P1-1), not FAILED, and one test deliberately starts from that.
  const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event } });
  return { tenant, shipment, log };
}

test.describe("Notification retry", () => {
  test("a provider rejection is recorded as FAILED with the provider's own reason", async () => {
    const { tenant, log } = await failedNotification();

    expect(log.status).toBe("FAILED");
    expect(log.providerError).toContain("temporary outage");
    expect(log.providerMessageId).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("a successful retry sends the same row, without creating a second one", async () => {
    const { tenant, shipment, log } = await failedNotification();
    const before = await prisma.notificationLog.count({ where: { shipmentId: shipment.id } });

    const result = await retryNotification(tenant.company.id, log.id);
    expect(result.status).toBe("SENT");

    const after = await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(after.status).toBe("SENT");
    expect(after.providerMessageId).toBeTruthy();
    // The failure reason is cleared on success — a SENT row still showing why it once failed reads
    // as an unresolved problem.
    expect(after.providerError).toBeNull();
    expect(await prisma.notificationLog.count({ where: { shipmentId: shipment.id } })).toBe(before);
    // The idempotency slot is the same one, still claimed by this single row.
    expect(after.trackingEventId).toBe(log.trackingEventId);

    await cleanupTenant(tenant.company.id);
  });

  test("a retry that fails again stays FAILED, carrying the latest reason", async () => {
    const { tenant, log } = await failedNotification();

    const result = await withFailingProvider("provider rejected: number blocked", () =>
      retryNotification(tenant.company.id, log.id)
    );
    expect(result.status).toBe("FAILED");

    const after = await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(after.status).toBe("FAILED");
    expect(after.providerError).toContain("number blocked");
    expect(after.providerError).not.toContain("temporary outage");
    // Still retryable — a second outage is not a dead end.
    await expect(retryNotification(tenant.company.id, log.id)).resolves.toEqual({ status: "SENT" });

    await cleanupTenant(tenant.company.id);
  });

  test("an already-sent notification can never be re-sent", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });
    await dispatchShipmentEvent("SHIPMENT_RECEIVED", shipment.id, uniqEventId("sent"));
    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    expect(log.status).toBe("SENT");

    await expect(retryNotification(tenant.company.id, log.id)).rejects.toThrow(/تم إرسال هذا الإشعار بالفعل/);
    expect(await prisma.notificationLog.count({ where: { shipmentId: shipment.id } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("a SKIPPED row is not treated as a failure and is not retryable", async () => {
    // An unreachable receiver is SKIPPED by design (P1-1) — a retry would fail identically, so the
    // fix is the phone number, not another attempt.
    const { tenant, shipment } = await failedNotification("SHIPMENT_RECEIVED");
    const skipped = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    await prisma.notificationLog.update({ where: { id: skipped.id }, data: { status: "SKIPPED" } });

    await expect(retryNotification(tenant.company.id, skipped.id)).rejects.toThrow(/غير فاشل/);
    expect((await prisma.notificationLog.findUniqueOrThrow({ where: { id: skipped.id } })).status).toBe("SKIPPED");

    await cleanupTenant(tenant.company.id);
  });

  test("sender and receiver rows retry independently", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
      receiverPhone: "+967771234567",
    });
    // TRIP_DEPARTED is the one event addressed to both parties, so it produces two rows to fail.
    await withFailingProvider("provider rejected: outage", () =>
      dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, uniqEventId("both"))
    );
    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id }, orderBy: { recipient: "asc" } });
    expect(logs).toHaveLength(2);

    const customerLog = logs.find((l) => l.recipient === "CUSTOMER")!;
    await retryNotification(tenant.company.id, customerLog.id);

    const [customerAfter, receiverAfter] = await Promise.all([
      prisma.notificationLog.findUniqueOrThrow({ where: { id: customerLog.id } }),
      prisma.notificationLog.findUniqueOrThrow({ where: { id: logs.find((l) => l.recipient === "RECEIVER")!.id } }),
    ]);
    expect(customerAfter.status).toBe("SENT");
    // Retrying one party must not silently resolve the other's failure.
    expect(receiverAfter.status).toBe("FAILED");
    expect(await prisma.notificationLog.count({ where: { shipmentId: shipment.id } })).toBe(2);

    await cleanupTenant(tenant.company.id);
  });

  test("when both parties share a number, a retry does not deliver the same message twice", async () => {
    const tenant = await createTestTenant();
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: tenant.customerId } });
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
      receiverPhone: "+967771234567",
    });
    await withFailingProvider("provider rejected: outage", () =>
      dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, uniqEventId("shared"))
    );
    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id } });
    const customerLog = logs.find((l) => l.recipient === "CUSTOMER")!;
    const receiverLog = logs.find((l) => l.recipient === "RECEIVER")!;

    // The office corrects the receiver's number — and it turns out to be the sender's own.
    await prisma.shipment.update({ where: { id: shipment.id }, data: { receiverPhone: customer.phone } });

    await retryNotification(tenant.company.id, customerLog.id);
    const receiverResult = await retryNotification(tenant.company.id, receiverLog.id);

    expect(receiverResult.status).toBe("SKIPPED");
    const receiverAfter = await prisma.notificationLog.findUniqueOrThrow({ where: { id: receiverLog.id } });
    expect(receiverAfter.status).toBe("SKIPPED");
    expect(receiverAfter.providerError).toContain("already delivered to this number");

    await cleanupTenant(tenant.company.id);
  });

  test("a corrected phone number is what the retry actually uses", async () => {
    const { tenant, shipment, log } = await failedNotification("SHIPMENT_ARRIVED", "12345");
    // SHIPMENT_ARRIVED is receiver-routed, and an unusable receiver number is SKIPPED, so make it a
    // genuine provider failure first to get a retryable row.
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: "FAILED", providerError: "provider rejected" } });

    await prisma.shipment.update({ where: { id: shipment.id }, data: { receiverPhone: "+967771234567" } });
    const result = await retryNotification(tenant.company.id, log.id);

    expect(result.status).toBe("SENT");
    const after = await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } });
    // The row reports where the message really went, not the number that failed.
    expect(after.toPhone).toBe("+967771234567");

    await cleanupTenant(tenant.company.id);
  });

  test("company isolation: another tenant cannot retry a log it does not own", async () => {
    const { tenant, log } = await failedNotification();
    const outsider = await createTestTenant();

    await expect(retryNotification(outsider.company.id, log.id)).rejects.toThrow(/غير موجود/);
    expect((await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe("FAILED");

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Notification retry — screen", () => {
  test("the failed row shows an Arabic reason, a retry button, and the counts; retrying sends it", async ({ page }) => {
    const { tenant, shipment } = await failedNotification();
    // A second row that was skipped for a missing receiver number, so both counters have something
    // to report and the skipped row can be checked for *not* offering a retry.
    await prisma.shipment.update({ where: { id: shipment.id }, data: { receiverPhone: "" } });
    await dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, uniqEventId("skipped-ui"));

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, tenant.adminEmail);
    await page.goto("/app/notifications");

    const counts = page.getByTestId("notification-counts");
    await expect(counts).toHaveText(/1/);
    await expect(page.locator("text=لا يوجد رقم جوال للمستلم")).toBeVisible();

    // Exactly one retry button: the FAILED row has one, the SKIPPED row does not.
    const retry = page.locator('button:has-text("إعادة الإرسال")');
    await expect(retry).toHaveCount(1);
    await retry.click();

    await pollUntil(
      () => prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_RECEIVED" } }),
      (l) => l.status === "SENT"
    );
    await expect(page.locator("text=تم إرسال الإشعار")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("mobile: the failed row and its retry button stay usable at 390px", async ({ page }) => {
    const { tenant, shipment } = await failedNotification();

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, tenant.adminEmail);
    await page.goto("/app/notifications");

    const retry = page.locator('button:has-text("إعادة الإرسال")').first();
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    // The page itself must not scroll sideways; the table may, inside its own container.
    const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await retry.click();
    await pollUntil(
      () => prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id } }),
      (l) => l.status === "SENT"
    );

    await cleanupTenant(tenant.company.id);
  });

  test("RBAC: a role without shipments.updateStatus sees no retry button, and the action refuses it", async ({ page }) => {
    const { tenant, log } = await failedNotification();
    const viewer = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[0].id,
      permissions: { shipments: ["view"] },
    });

    await login(page, viewer.email);
    await page.goto("/app/notifications");
    await expect(page.locator('button:has-text("إعادة الإرسال")')).toHaveCount(0);

    // And not merely hidden: the row is untouched, still FAILED, still retryable by someone who may.
    expect((await prisma.notificationLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe("FAILED");

    await cleanupTenant(tenant.company.id);
  });
});
