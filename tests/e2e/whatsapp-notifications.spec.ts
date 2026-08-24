import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, cleanupTenant } from "./helpers";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { notificationProvider } from "@/modules/notifications/provider";
import { normalizePhone } from "@/lib/phone";

/**
 * Exercises notifications/service.ts directly (no browser) — these are the specific guarantees
 * Phase 3A depends on: a WhatsApp failure never blocks the underlying business action, retried
 * dispatch for the same occurrence never double-sends, tenant branding never bleeds across
 * companies, and an unrecognized phone fails the notification, not the caller. All run under the
 * mock provider (WHATSAPP_PROVIDER unset) — no real WhatsApp send is ever triggered by this suite.
 */
test.describe("WhatsApp notification dispatch", () => {
  test("success: mock provider send is logged as SENT", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 2,
    });

    await dispatchShipmentEvent("SHIPMENT_RECEIVED", shipment.id, `test-tracking-${shipment.id}-1`);

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_RECEIVED" } });
    expect(log.status).toBe("SENT");
    expect(log.providerMessageId).toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("failure: provider returning ok:false does not throw, and is recorded as FAILED", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });

    const original = notificationProvider.send;
    notificationProvider.send = async () => ({ ok: false, error: "simulated provider rejection", retryable: false });
    try {
      await expect(dispatchShipmentEvent("SHIPMENT_RECEIVED", shipment.id, `test-tracking-${shipment.id}-1`)).resolves.not.toThrow();
    } finally {
      notificationProvider.send = original;
    }

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_RECEIVED" } });
    expect(log.status).toBe("FAILED");
    expect(log.providerError).toContain("simulated provider rejection");

    await cleanupTenant(tenant.company.id);
  });

  test("provider unavailable: a thrown error from the provider still resolves to a recorded FAILED, never an unhandled rejection", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });

    const original = notificationProvider.send;
    notificationProvider.send = async () => {
      throw new Error("ECONNREFUSED");
    };
    try {
      await expect(dispatchShipmentEvent("SHIPMENT_RECEIVED", shipment.id, `test-tracking-${shipment.id}-1`)).resolves.not.toThrow();
    } finally {
      notificationProvider.send = original;
    }

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_RECEIVED" } });
    expect(log.status).toBe("FAILED");
    expect(log.providerError).toContain("ECONNREFUSED");

    await cleanupTenant(tenant.company.id);
  });

  test("idempotency: two dispatches for the same trackingEventId produce exactly one NotificationLog row", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });
    const trackingEventId = `test-tracking-${shipment.id}-duplicate`;

    await Promise.all([
      dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, trackingEventId),
      dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, trackingEventId),
    ]);

    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id, event: "SHIPMENT_ARRIVED" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe("SENT");

    await cleanupTenant(tenant.company.id);
  });

  test("tenant branding: two companies' messages each carry their own company name, never the other's", async () => {
    const tenantA = await createTestTenant();
    const tenantB = await createTestTenant();
    const shipmentA = await createTestShipment({
      companyId: tenantA.company.id,
      customerId: tenantA.customerId,
      loadBranchId: tenantA.branches[0].id,
      unloadBranchId: tenantA.branches[1].id,
      cartonCount: 1,
    });
    const shipmentB = await createTestShipment({
      companyId: tenantB.company.id,
      customerId: tenantB.customerId,
      loadBranchId: tenantB.branches[0].id,
      unloadBranchId: tenantB.branches[1].id,
      cartonCount: 1,
    });

    await dispatchShipmentEvent("SHIPMENT_RECEIVED", shipmentA.id, `test-tracking-${shipmentA.id}`);
    await dispatchShipmentEvent("SHIPMENT_RECEIVED", shipmentB.id, `test-tracking-${shipmentB.id}`);

    const [logA, logB] = await Promise.all([
      prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipmentA.id } }),
      prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipmentB.id } }),
    ]);

    expect(logA.message).toContain(tenantA.company.name);
    expect(logA.message).not.toContain(tenantB.company.name);
    expect(logB.message).toContain(tenantB.company.name);
    expect(logB.message).not.toContain(tenantA.company.name);

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });

  test("tracking URL: the arrived-shipment message contains the real public tracking link", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });

    await dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, `test-tracking-${shipment.id}`);

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_ARRIVED" } });
    expect(log.message).toContain(`/t/${shipment.trackingToken}`);
    // The old, enumerable shape must be gone entirely.
    expect(log.message).not.toContain(`/t/${shipment.shipmentNumber}`);

    await cleanupTenant(tenant.company.id);
  });

  test("invalid phone: an unrecognized number fails the notification without throwing", async () => {
    const tenant = await createTestTenant();
    const badCustomer = await prisma.customer.create({
      data: { companyId: tenant.company.id, name: "عميل برقم غير صالح", phone: "12345" },
    });
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: badCustomer.id,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });

    await dispatchShipmentEvent("SHIPMENT_RECEIVED", shipment.id, `test-tracking-${shipment.id}`);

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_RECEIVED" } });
    expect(log.status).toBe("FAILED");
    expect(log.providerError).toContain("phone");

    await cleanupTenant(tenant.company.id);
  });

  test("curation: an event with no approved Meta template is SKIPPED under the real provider, without calling it", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
    });

    let sendCalled = false;
    const original = notificationProvider.send;
    notificationProvider.send = async (...args: Parameters<typeof original>) => {
      sendCalled = true;
      return original(...args);
    };
    const originalEnv = process.env.WHATSAPP_PROVIDER;
    process.env.WHATSAPP_PROVIDER = "meta"; // SHIPMENT_LOADED has no META_TEMPLATES entry — must skip
    try {
      await dispatchShipmentEvent("SHIPMENT_LOADED", shipment.id, `test-tracking-${shipment.id}`);
    } finally {
      process.env.WHATSAPP_PROVIDER = originalEnv;
      notificationProvider.send = original;
    }

    expect(sendCalled).toBe(false);
    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_LOADED" } });
    expect(log.status).toBe("SKIPPED");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Phone normalization", () => {
  const cases: [string, string | null][] = [
    ["+967771234567", "+967771234567"],
    ["+966501234567", "+966501234567"],
    ["00967771234567", "+967771234567"],
    ["0771234567", "+967771234567"],
    ["771234567", "+967771234567"],
    ["0501234567", "+966501234567"],
    ["501234567", "+966501234567"],
    ["+967 77 123 4567", "+967771234567"],
    ["12345", null],
    ["", null],
    ["+1234567890", null], // out-of-market country code
    ["+96799", null], // too short
  ];

  for (const [input, expected] of cases) {
    test(`normalizePhone(${JSON.stringify(input)}) -> ${JSON.stringify(expected)}`, () => {
      expect(normalizePhone(input)).toBe(expected);
    });
  }
});
