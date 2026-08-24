import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, cleanupTenant } from "./helpers";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { EVENT_RECIPIENTS, META_TEMPLATES } from "@/modules/notifications/templates";
import { SHIPMENT_EVENTS } from "@/lib/enums";

/**
 * P1-1: a shipment has two humans, and until now only one of them ever heard from the system.
 * Every message went to Shipment.customer — the person who handed the cartons over — including
 * "شحنتك في الطريق إليك الآن", which is addressed to whoever is waiting at the destination.
 *
 * These tests pin the routing itself (who gets what), not the copy: that each event reaches exactly
 * the party EVENT_RECIPIENTS names, that the one dual-recipient event produces two independent
 * messages, that an unreachable receiver degrades to a logged skip rather than a failure, and that
 * none of this leaks across tenants. All run under the mock provider — no real WhatsApp send.
 */

const uniqEventId = (label: string) => `test-routing-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function tenantWithShipment(receiverPhone?: string) {
  const tenant = await createTestTenant();
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: tenant.branches[0].id,
    unloadBranchId: tenant.branches[1].id,
    cartonCount: 2,
    receiverPhone,
  });
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: tenant.customerId } });
  return { tenant, shipment, customer };
}

test.describe("Notification recipients — sender vs receiver routing", () => {
  test("arrival-side events reach the receiver, not the sender", async () => {
    const { tenant, shipment, customer } = await tenantWithShipment();

    await dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, uniqEventId("arrived"));

    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id, event: "SHIPMENT_ARRIVED" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].recipient).toBe("RECEIVER");
    expect(logs[0].toPhone).toBe(shipment.receiverPhone);
    expect(logs[0].toPhone).not.toBe(customer.phone);
    expect(logs[0].status).toBe("SENT");
    // The pickup-or-delivery call to action and its tracking link must land with the person who
    // actually has to choose — that is the whole reason this event is receiver-routed.
    expect(logs[0].message).toContain(`/t/${shipment.trackingToken}`);

    await cleanupTenant(tenant.company.id);
  });

  test("handover and closing events reach the sender, not the receiver", async () => {
    const { tenant, shipment, customer } = await tenantWithShipment();

    await dispatchShipmentEvent("SHIPMENT_RECEIVED", shipment.id, uniqEventId("received"));
    await dispatchShipmentEvent("SHIPMENT_DELIVERED", shipment.id, uniqEventId("delivered"));

    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.recipient === "CUSTOMER")).toBe(true);
    expect(logs.every((l) => l.toPhone === customer.phone)).toBe(true);
    expect(logs.every((l) => l.toPhone !== shipment.receiverPhone)).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("departure notifies both parties — two messages, two numbers, one event", async () => {
    const { tenant, shipment, customer } = await tenantWithShipment();

    await dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, uniqEventId("departed"));

    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id, event: "TRIP_DEPARTED" } });
    expect(logs).toHaveLength(2);
    expect(new Set(logs.map((l) => l.recipient))).toEqual(new Set(["CUSTOMER", "RECEIVER"]));
    expect(logs.find((l) => l.recipient === "CUSTOMER")!.toPhone).toBe(customer.phone);
    expect(logs.find((l) => l.recipient === "RECEIVER")!.toPhone).toBe(shipment.receiverPhone);
    expect(logs.every((l) => l.status === "SENT")).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("duplicate prevention: a retried dual-recipient dispatch still produces exactly one message per party", async () => {
    const { tenant, shipment } = await tenantWithShipment();
    const trackingEventId = uniqEventId("departed-duplicate");

    // Concurrent (racing invocations) and then sequential (a retry after the first fully finished) —
    // the idempotency key is now (trackingEventId, recipient), and both shapes must respect it.
    await Promise.all([
      dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, trackingEventId),
      dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, trackingEventId),
    ]);
    await dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, trackingEventId);

    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id, event: "TRIP_DEPARTED" } });
    expect(logs).toHaveLength(2);
    expect(logs.filter((l) => l.recipient === "CUSTOMER")).toHaveLength(1);
    expect(logs.filter((l) => l.recipient === "RECEIVER")).toHaveLength(1);

    await cleanupTenant(tenant.company.id);
  });

  test("sender and receiver are the same person: one message, not two", async () => {
    const tenant = await createTestTenant();
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: tenant.customerId } });
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 1,
      receiverPhone: customer.phone,
    });
    const trackingEventId = uniqEventId("departed-self");

    await dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, trackingEventId);
    // The de-duplication is decided from the two numbers alone, so a retry must reach the same
    // verdict rather than deciding the receiver was never messaged and sending a second copy.
    await dispatchShipmentEvent("TRIP_DEPARTED", shipment.id, trackingEventId);

    const logs = await prisma.notificationLog.findMany({ where: { shipmentId: shipment.id, event: "TRIP_DEPARTED" } });
    expect(logs).toHaveLength(1);
    expect(logs[0].recipient).toBe("CUSTOMER");

    await cleanupTenant(tenant.company.id);
  });

  test("missing receiver phone: SKIPPED with a stated reason, and the dispatch never throws", async () => {
    const { tenant, shipment } = await tenantWithShipment("");

    await expect(dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, uniqEventId("no-receiver"))).resolves.not.toThrow();

    const log = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_ARRIVED" } });
    expect(log.recipient).toBe("RECEIVER");
    expect(log.status).toBe("SKIPPED");
    expect(log.providerError).toContain("no phone number on file");
    // The shipment itself is untouched — an unreachable receiver is a notification gap, never a
    // failed operation.
    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.status).toBe(shipment.status);

    await cleanupTenant(tenant.company.id);
  });

  test("unusable receiver phone: SKIPPED, while the sender's own events still go out", async () => {
    const { tenant, shipment, customer } = await tenantWithShipment("12345");

    await dispatchShipmentEvent("SHIPMENT_ARRIVED", shipment.id, uniqEventId("bad-receiver"));
    await dispatchShipmentEvent("SHIPMENT_DELIVERED", shipment.id, uniqEventId("bad-receiver-delivered"));

    const arrived = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_ARRIVED" } });
    expect(arrived.status).toBe("SKIPPED");
    expect(arrived.providerError).toContain("invalid or unrecognized phone number format");

    const delivered = await prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: shipment.id, event: "SHIPMENT_DELIVERED" } });
    expect(delivered.status).toBe("SENT");
    expect(delivered.toPhone).toBe(customer.phone);

    await cleanupTenant(tenant.company.id);
  });

  test("company isolation: each tenant's receiver gets that tenant's own message and number", async () => {
    const a = await tenantWithShipment("+967771111111");
    const b = await tenantWithShipment("+967772222222");

    await dispatchShipmentEvent("SHIPMENT_ARRIVED", a.shipment.id, uniqEventId("iso-a"));
    await dispatchShipmentEvent("SHIPMENT_ARRIVED", b.shipment.id, uniqEventId("iso-b"));

    const [logA, logB] = await Promise.all([
      prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: a.shipment.id } }),
      prisma.notificationLog.findFirstOrThrow({ where: { shipmentId: b.shipment.id } }),
    ]);

    expect(logA.companyId).toBe(a.tenant.company.id);
    expect(logA.toPhone).toBe("+967771111111");
    expect(logA.message).toContain(a.tenant.company.name);
    expect(logA.message).not.toContain(b.tenant.company.name);

    expect(logB.companyId).toBe(b.tenant.company.id);
    expect(logB.toPhone).toBe("+967772222222");
    expect(logB.message).toContain(b.tenant.company.name);
    expect(logB.message).not.toContain(a.tenant.company.name);

    // Neither tenant's receiver may appear in the other tenant's notification log at all.
    const crossed = await prisma.notificationLog.count({ where: { companyId: a.tenant.company.id, toPhone: "+967772222222" } });
    expect(crossed).toBe(0);

    await cleanupTenant(a.tenant.company.id);
    await cleanupTenant(b.tenant.company.id);
  });

  test("routing table covers every event exactly once, and adds no eighth Meta template", async () => {
    for (const event of SHIPMENT_EVENTS) {
      const recipients = EVENT_RECIPIENTS[event];
      expect(recipients.length, `${event} must name at least one recipient`).toBeGreaterThan(0);
      expect(new Set(recipients).size, `${event} must not repeat a recipient`).toBe(recipients.length);
    }
    // Routing is a product decision about *who*; it must never quietly grow Meta's approved-template
    // surface, which is an external, review-gated resource.
    expect(Object.keys(META_TEMPLATES)).toHaveLength(7);
  });
});
