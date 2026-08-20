import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createBranchScopedUser, login, cleanupTenant, pollUntil, expectNotFound } from "./helpers";
import { confirmBranchPickup } from "@/modules/shipments/service";
import { markDelivered } from "@/modules/delivery/service";

/**
 * P1-2: until now a handover recorded only that the shipment reached DELIVERED. Who physically took
 * the cartons was nowhere, so "I never received it" had no answer.
 *
 * Proof is shipment-level, written in the same transaction as the DELIVERED transition, by both
 * handover paths. These tests pin that: the evidence is stored, a failed check changes nothing at
 * all, a handover cannot happen twice, and none of the surrounding machinery (cartons, tracking
 * timeline, WhatsApp, branch/company scoping) was disturbed by adding it.
 */

const RECEIVER_PHONE = "+967771234567"; // last 4 = 4567
const GOOD = { receivedByName: "محمد الشرعبي", last4: "4567" };

async function readyForPickupShipment() {
  const tenant = await createTestTenant();
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: tenant.branches[0].id,
    unloadBranchId: tenant.branches[1].id,
    cartonCount: 3,
    status: "READY_FOR_PICKUP",
    receiverPhone: RECEIVER_PHONE,
  });
  return { tenant, shipment };
}

/** A shipment sitting at OUT_FOR_DELIVERY with a matching delivery request — the home-delivery
 *  counterpart of the branch counter's READY_FOR_PICKUP. */
async function outForDeliveryShipment() {
  const tenant = await createTestTenant();
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: tenant.branches[0].id,
    unloadBranchId: tenant.branches[1].id,
    cartonCount: 2,
    status: "OUT_FOR_DELIVERY",
    receiverPhone: RECEIVER_PHONE,
  });
  const request = await prisma.deliveryRequest.create({
    data: {
      companyId: tenant.company.id,
      shipmentId: shipment.id,
      customerName: "عميل اختبار",
      customerPhone: "+967700000000",
      pickupBranchId: tenant.branches[1].id,
      destinationAddress: "حي تجريبي",
      cartonCount: 2,
      status: "OUT_FOR_DELIVERY",
    },
  });
  return { tenant, shipment, request };
}

test.describe("Delivery proof — branch counter", () => {
  test("a full handover records who took the cartons, when, and by which route", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    await confirmBranchPickup(shipment.id, GOOD);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("DELIVERED");
    expect(db.deliveredToName).toBe("محمد الشرعبي");
    expect(db.deliveredToLast4).toBe("4567");
    expect(db.deliveryChannel).toBe("BRANCH_PICKUP");
    expect(db.deliveredAt).toBeTruthy();
    expect(db.deliveryNote).toBeNull();

    // Carton-level status is untouched by the proof — every carton still flips, as before.
    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id } });
    expect(cartons).toHaveLength(3);
    expect(cartons.every((c) => c.status === "DELIVERED")).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("the collector can be someone other than the named receiver", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    // The receiver's brother collects, using the receiver's number to verify — the exact case the
    // name field exists for. The shipment's own receiverName must not be overwritten by it.
    await confirmBranchPickup(shipment.id, { receivedByName: "أخو المستلم", last4: "4567", note: "بطاقة الأخ مطابقة" });

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.deliveredToName).toBe("أخو المستلم");
    expect(db.receiverName).toBe("مستلم اختبار");
    expect(db.deliveryNote).toBe("بطاقة الأخ مطابقة");

    await cleanupTenant(tenant.company.id);
  });

  test("a wrong last-4 changes nothing at all — not status, not cartons, not the timeline", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    await expect(confirmBranchPickup(shipment.id, { receivedByName: "محمد", last4: "9999" })).rejects.toThrow(/آخر 4 أرقام/);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("READY_FOR_PICKUP");
    expect(db.deliveredAt).toBeNull();
    expect(db.deliveredToName).toBeNull();

    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id } });
    expect(cartons.every((c) => c.status !== "DELIVERED")).toBe(true);
    // The whole write rolls back together: no half-applied handover, no phantom tracking event.
    expect(await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } })).toBe(0);
    expect(await prisma.notificationLog.count({ where: { shipmentId: shipment.id, event: "SHIPMENT_DELIVERED" } })).toBe(0);

    await cleanupTenant(tenant.company.id);
  });

  test("an empty collector name is refused before anything is written", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    await expect(confirmBranchPickup(shipment.id, { receivedByName: "  ", last4: "4567" })).rejects.toThrow(/اسم الشخص/);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(tenant.company.id);
  });

  test("retry after a failed check succeeds and leaves exactly one handover", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    await expect(confirmBranchPickup(shipment.id, { receivedByName: "محمد", last4: "0000" })).rejects.toThrow();
    await confirmBranchPickup(shipment.id, GOOD);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("DELIVERED");
    expect(db.deliveredToName).toBe("محمد الشرعبي");
    expect(await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment cannot be handed over twice, and the second attempt cannot overwrite the proof", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    await confirmBranchPickup(shipment.id, GOOD);
    // DELIVERED has no outgoing edge in the state machine, so the transition itself is the guard —
    // no separate "already delivered" flag to keep in sync.
    await expect(confirmBranchPickup(shipment.id, { receivedByName: "شخص آخر", last4: "4567" })).rejects.toThrow();

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.deliveredToName).toBe("محمد الشرعبي");
    expect(await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("partial delivery is not a workflow this product has — a partially arrived shipment cannot be handed over", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 4,
      status: "PARTIALLY_ARRIVED",
      receiverPhone: RECEIVER_PHONE,
    });

    // PARTIALLY_ARRIVED -> DELIVERED is not a legal transition: the remaining cartons must arrive
    // first (confirmRemainingArrived), then the whole shipment is handed over once. That is why the
    // proof is one record per shipment rather than one per carton.
    await expect(confirmBranchPickup(shipment.id, GOOD)).rejects.toThrow(/انتقال حالة غير مسموح/);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).deliveredAt).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("the handover reaches the tracking timeline and the sender's WhatsApp", async () => {
    const { tenant, shipment } = await readyForPickupShipment();

    await confirmBranchPickup(shipment.id, GOOD);

    const event = await prisma.trackingEvent.findFirstOrThrow({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } });
    expect(event.title).toBe("تم التسليم");
    expect(event.description).toContain("محمد الشرعبي");
    expect(event.isCustomerVisible).toBe(true);

    // P1-1 routing is unchanged by this: the delivery receipt still goes to the sender.
    const log = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: shipment.id, event: "SHIPMENT_DELIVERED" } }),
      (l) => l !== null
    );
    expect(log!.recipient).toBe("CUSTOMER");
    expect(log!.status).toBe("SENT");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Delivery proof — home delivery", () => {
  test("a completed delivery records the same evidence, with HOME_DELIVERY as the channel", async () => {
    const { tenant, shipment, request } = await outForDeliveryShipment();

    await markDelivered(tenant.company.id, request.id, { receivedByName: "زوجة المستلم", last4: "4567", note: "سُلمت عند الباب" });

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("DELIVERED");
    expect(db.deliveredToName).toBe("زوجة المستلم");
    expect(db.deliveredToLast4).toBe("4567");
    expect(db.deliveryChannel).toBe("HOME_DELIVERY");
    expect(db.deliveryNote).toBe("سُلمت عند الباب");
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("DELIVERED");

    await cleanupTenant(tenant.company.id);
  });

  test("a wrong last-4 rolls the delivery request back too, leaving it retryable", async () => {
    const { tenant, shipment, request } = await outForDeliveryShipment();

    await expect(markDelivered(tenant.company.id, request.id, { receivedByName: "زوجة المستلم", last4: "4321" })).rejects.toThrow(/آخر 4 أرقام/);

    // The guarded claim that marks the request DELIVERED runs inside the same transaction, so a
    // failed check must not leave the request closed with no proof behind it.
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("OUT_FOR_DELIVERY");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("OUT_FOR_DELIVERY");

    await markDelivered(tenant.company.id, request.id, GOOD);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).deliveredToName).toBe("محمد الشرعبي");

    await cleanupTenant(tenant.company.id);
  });

  test("a second confirmation is rejected and cannot rewrite the proof", async () => {
    const { tenant, shipment, request } = await outForDeliveryShipment();

    await markDelivered(tenant.company.id, request.id, GOOD);
    await expect(markDelivered(tenant.company.id, request.id, { receivedByName: "شخص آخر", last4: "4567" })).rejects.toThrow();

    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).deliveredToName).toBe("محمد الشرعبي");

    await cleanupTenant(tenant.company.id);
  });

  test("company and branch isolation: proof cannot be recorded from outside the owning tenant or branch", async () => {
    const { tenant, shipment, request } = await outForDeliveryShipment();
    const other = await createTestTenant();

    // Another company holding a real request id gets nothing — the claim is scoped by companyId.
    await expect(markDelivered(other.company.id, request.id, GOOD)).rejects.toThrow();
    // A branch-scoped employee at a branch that is not the pickup branch is refused too.
    await expect(markDelivered(tenant.company.id, request.id, GOOD, undefined, tenant.branches[0].id)).rejects.toThrow();

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("OUT_FOR_DELIVERY");
    expect(db.deliveredAt).toBeNull();

    // The legitimate branch still succeeds.
    await markDelivered(tenant.company.id, request.id, GOOD, undefined, tenant.branches[1].id);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).deliveredAt).toBeTruthy();

    await cleanupTenant(other.company.id);
    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Delivery proof — through the UI", () => {
  test("the counter dialog records the handover, and a wrong last-4 is refused on screen", async ({ page }) => {
    const { tenant, shipment } = await readyForPickupShipment();

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await page.click('button:has-text("تسليم من الفرع")');
    await page.fill('[role="dialog"] input[name="receivedByName"]', "محمد الشرعبي");
    await page.fill('[role="dialog"] input[name="last4"]', "9999");
    await page.click('[role="dialog"] button:has-text("تأكيد التسليم")');
    // FormDialog only closes on success — a refused check must leave the employee in the dialog
    // with the real reason, not a generic error.
    await expect(page.locator("text=آخر 4 أرقام لا تطابق").first()).toBeVisible();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await page.fill('[role="dialog"] input[name="last4"]', "4567");
    await page.click('[role="dialog"] button:has-text("تأكيد التسليم")');
    await expect(page.locator('[role="dialog"]')).toBeHidden();

    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "DELIVERED"
    );
    await expect(page.locator("text=إثبات التسليم").first()).toBeVisible();
    await expect(page.locator("text=محمد الشرعبي").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("an employee scoped to another branch cannot open the shipment to hand it over", async ({ page }) => {
    const { tenant, shipment } = await readyForPickupShipment();
    const outsider = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[2].id,
      permissions: { shipments: ["view", "updateStatus"] },
    });

    await login(page, outsider.email);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expectNotFound(page, [shipment.shipmentNumber]);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).deliveredAt).toBeNull();

    await cleanupTenant(tenant.company.id);
  });
});
