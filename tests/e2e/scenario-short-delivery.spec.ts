import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, login, cleanupTenant, pollUntil } from "./helpers";
import { confirmBranchPickup, markReadyForPickup } from "@/modules/shipments/service";
import { markDelivered } from "@/modules/delivery/service";
import { confirmBulkUnload, confirmRemainingArrived } from "@/modules/trips/service";

/**
 * P0-4: P1-5 made "which carton is missing" a real fact, and the handover paths erased it — both of
 * them ran `carton.updateMany({ where: { shipmentId } })`, so a carton that never arrived was
 * recorded as DELIVERED the moment the customer collected the rest. The evidence died at exactly
 * the point it was needed.
 *
 * These tests pin the rule: a missing carton stays missing through every write path, a short
 * handover is possible but must name itself, and only confirmRemainingArrived — "they turned up
 * after all" — may ever clear MISSING.
 */

const PROOF = { receivedByName: "محمد الشرعبي", last4: "4567" };
const RECEIVER_PHONE = "+967771234567";

/** A shipment that arrived at its destination one carton short, by the real unload flow. */
async function shortShipment(cartonCount = 5, missingIndexes = [3]) {
  const tenant = await createTestTenant(["الرياض", "المكلا", "سيئون"]);
  const [origin, destination, onward] = tenant.branches;
  const trip = await createTestTrip({
    companyId: tenant.company.id,
    driverId: tenant.driverId,
    stops: [
      { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
      { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
    ],
  });
  const [loadStop, unloadStop] = trip.stops;
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount,
    status: "IN_TRANSIT",
    receiverPhone: RECEIVER_PHONE,
  });
  await linkShipmentToTrip(trip.id, shipment.id, loadStop.id, unloadStop.id);
  await prisma.tripShipmentStop.updateMany({
    where: { tripId: trip.id, shipmentId: shipment.id },
    data: { loadedAt: new Date(), cartonsLoaded: cartonCount },
  });

  const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id }, orderBy: { cartonIndex: "asc" } });
  const missing = cartons.filter((c) => missingIndexes.includes(c.cartonIndex));
  await confirmBulkUnload(unloadStop.id, undefined, missing.map((c) => c.id));

  return { tenant, trip, unloadStop, shipment, missing, destination, onward };
}

const cartonsOf = (shipmentId: string) =>
  prisma.carton.findMany({ where: { shipmentId }, orderBy: { cartonIndex: "asc" } });

test.describe("Short delivery — branch counter", () => {
  test("a complete shipment still hands over cleanly, every carton delivered", async () => {
    const tenant = await createTestTenant();
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: tenant.branches[0].id,
      unloadBranchId: tenant.branches[1].id,
      cartonCount: 5,
      status: "READY_FOR_PICKUP",
      receiverPhone: RECEIVER_PHONE,
    });

    await confirmBranchPickup(shipment.id, PROOF);

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.every((c) => c.status === "DELIVERED")).toBe(true);
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("DELIVERED");
    expect(db.deliveredToName).toBe("محمد الشرعبي");

    await cleanupTenant(tenant.company.id);
  });

  test("handing over a short shipment leaves the missing carton MISSING", async () => {
    const { tenant, shipment, missing } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);

    await confirmBranchPickup(shipment.id, PROOF);

    const cartons = await cartonsOf(shipment.id);
    // The regression this whole task exists for: C3 must not become DELIVERED.
    expect(cartons.find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");
    expect(cartons.filter((c) => c.status === "DELIVERED").map((c) => c.cartonIndex)).toEqual([1, 2, 4, 5]);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("DELIVERED");
    expect(db.deliveredAt).toBeTruthy();
    // The proof records a real handover; the shortfall is derived from the cartons, not duplicated.
    expect(db.arrivedCartons).toBe(4);
    expect(missing).toHaveLength(1);

    await cleanupTenant(tenant.company.id);
  });

  test("several missing cartons all survive the handover", async () => {
    const { tenant, shipment } = await shortShipment(6, [1, 4]);
    await markReadyForPickup(shipment.id);

    await confirmBranchPickup(shipment.id, PROOF);

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.filter((c) => c.status === "MISSING").map((c) => c.cartonIndex)).toEqual([1, 4]);
    expect(cartons.filter((c) => c.status === "DELIVERED").map((c) => c.cartonIndex)).toEqual([2, 3, 5, 6]);

    await cleanupTenant(tenant.company.id);
  });

  test("the timeline says the handover was short, and names the carton", async () => {
    const { tenant, shipment, missing } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);

    await confirmBranchPickup(shipment.id, PROOF);

    const event = await prisma.trackingEvent.findFirstOrThrow({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } });
    expect(event.description).toContain("نقص");
    expect(event.description).toContain(missing[0].cartonCode);
    expect(event.description).toContain("محمد الشرعبي");

    await cleanupTenant(tenant.company.id);
  });

  test("the WhatsApp receipt does not claim a complete delivery", async () => {
    const { tenant, shipment } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);
    await confirmBranchPickup(shipment.id, PROOF);

    const short = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: shipment.id, event: "SHIPMENT_DELIVERED" } }),
      (l) => l !== null
    );
    expect(short!.message).toContain("نقص");

    // A complete handover keeps the plain receipt — the shortage wording appears only when true.
    const other = await createTestTenant();
    const whole = await createTestShipment({
      companyId: other.company.id,
      customerId: other.customerId,
      loadBranchId: other.branches[0].id,
      unloadBranchId: other.branches[1].id,
      cartonCount: 2,
      status: "READY_FOR_PICKUP",
      receiverPhone: RECEIVER_PHONE,
    });
    await confirmBranchPickup(whole.id, PROOF);
    const clean = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: whole.id, event: "SHIPMENT_DELIVERED" } }),
      (l) => l !== null
    );
    expect(clean!.message).not.toContain("نقص");

    await cleanupTenant(other.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("under the real provider a short delivery is skipped rather than sent as a clean receipt", async () => {
    const { tenant, shipment } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);

    // Meta templates are fixed approved text with no slot for "minus one carton", and no eighth
    // template was added — so the message is withheld with a reason instead of contradicting the
    // shipment record.
    const originalEnv = process.env.WHATSAPP_PROVIDER;
    process.env.WHATSAPP_PROVIDER = "meta";
    try {
      await confirmBranchPickup(shipment.id, PROOF);
    } finally {
      process.env.WHATSAPP_PROVIDER = originalEnv;
    }

    const log = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: shipment.id, event: "SHIPMENT_DELIVERED" } }),
      (l) => l !== null
    );
    expect(log!.status).toBe("SKIPPED");
    expect(log!.providerError).toContain("delivered short");

    await cleanupTenant(tenant.company.id);
  });

  test("a second handover attempt is refused and cannot rewrite the cartons", async () => {
    const { tenant, shipment } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);
    await confirmBranchPickup(shipment.id, PROOF);

    await expect(confirmBranchPickup(shipment.id, PROOF)).rejects.toThrow();

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");
    expect(await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("a wrong last-4 rolls back, and the retry still preserves the shortfall", async () => {
    const { tenant, shipment } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);

    await expect(confirmBranchPickup(shipment.id, { receivedByName: "محمد", last4: "0000" })).rejects.toThrow(/آخر 4 أرقام/);
    const midway = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(midway.status).toBe("READY_FOR_PICKUP");
    expect((await cartonsOf(shipment.id)).filter((c) => c.status === "DELIVERED")).toHaveLength(0);

    await confirmBranchPickup(shipment.id, PROOF);
    const cartons = await cartonsOf(shipment.id);
    expect(cartons.find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");
    expect(cartons.filter((c) => c.status === "DELIVERED")).toHaveLength(4);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Short delivery — home delivery", () => {
  test("a short home delivery preserves the missing carton too", async () => {
    const { tenant, shipment, destination } = await shortShipment(5, [2]);
    const request = await prisma.deliveryRequest.create({
      data: {
        companyId: tenant.company.id,
        shipmentId: shipment.id,
        customerName: "عميل اختبار",
        customerPhone: "+967700000000",
        pickupBranchId: destination.id,
        destinationAddress: "حي تجريبي",
        cartonCount: 5,
        status: "OUT_FOR_DELIVERY",
      },
    });
    // PARTIALLY_ARRIVED -> DELIVERY_REQUESTED -> OUT_FOR_DELIVERY, the legal route a short shipment
    // now has to home delivery.
    await prisma.shipment.update({ where: { id: shipment.id }, data: { status: "OUT_FOR_DELIVERY" } });

    await markDelivered(tenant.company.id, request.id, PROOF);

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.find((c) => c.cartonIndex === 2)!.status).toBe("MISSING");
    expect(cartons.filter((c) => c.status === "DELIVERED")).toHaveLength(4);
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.deliveryChannel).toBe("HOME_DELIVERY");

    const event = await prisma.trackingEvent.findFirstOrThrow({ where: { shipmentId: shipment.id, eventType: "DELIVERED" } });
    expect(event.description).toContain("نقص");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("MISSING is preserved by every other write path", () => {
  test("only confirmRemainingArrived may clear a missing carton", async () => {
    const { tenant, shipment } = await shortShipment(5, [3]);

    // This is the one path whose entire meaning is "the rest turned up".
    await confirmRemainingArrived(shipment.id);

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.every((c) => c.status === "ARRIVED")).toBe(true);
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("ARRIVED");
    expect(db.arrivedCartons).toBe(5);

    await cleanupTenant(tenant.company.id);
  });

  test("re-loading a shipment onto another trip does not resurrect a missing carton", async () => {
    const { tenant, shipment, destination, onward } = await shortShipment(5, [3]);
    const { raiseException, resolveException } = await import("@/modules/shipments/service");
    const { confirmBulkLoad } = await import("@/modules/trips/service");

    // The recovery route a stuck shipment takes: exception, resolved back onto the road.
    await raiseException(shipment.id, "WRONG_DESTINATION", "أُرسلت لفرع خاطئ");
    await resolveException(shipment.id, undefined, "READY_FOR_LOADING");

    const trip2 = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: destination.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: onward.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    await linkShipmentToTrip(trip2.id, shipment.id, trip2.stops[0].id, trip2.stops[1].id);
    await confirmBulkLoad(trip2.stops[0].id);

    const cartons = await cartonsOf(shipment.id);
    expect(cartons.find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");
    expect(cartons.filter((c) => c.status === "LOADED")).toHaveLength(4);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("Short delivery — screens", () => {
  test("mobile: the counter is warned and the button names what it is doing", async ({ page }) => {
    const { tenant, shipment, missing } = await shortShipment(5, [3]);
    await markReadyForPickup(shipment.id);

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await page.click('button:has-text("تسليم من الفرع")');
    await expect(page.locator("text=يوجد 1 كرتون مفقود")).toBeVisible();
    await expect(page.locator(`text=${missing[0].cartonCode}`).first()).toBeVisible();
    // Not a bare "تسليم": the employee has to sign off on a shortage knowingly.
    const confirm = page.locator('[role="dialog"] button:has-text("تسليم مع نقص مؤكّد")');
    await expect(confirm).toBeVisible();
    await expect(page.locator('[role="dialog"] button:has-text("إلغاء")')).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.fill('[role="dialog"] input[name="last4"]', "4567");
    await confirm.click();
    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "DELIVERED"
    );

    await expect(page.locator("text=نقص عند التسليم").first()).toBeVisible();
    expect((await cartonsOf(shipment.id)).find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");

    await cleanupTenant(tenant.company.id);
  });

  test("desktop: a complete shipment shows no shortage warning and the plain confirm", async ({ page }) => {
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

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("تسليم من الفرع")');

    await expect(page.locator("text=كرتون مفقود")).toHaveCount(0);
    await expect(page.locator('[role="dialog"] button:has-text("تأكيد التسليم")')).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("a partially arrived shipment can be made ready for pickup without claiming the rest arrived", async ({ page }) => {
    const { tenant, shipment } = await shortShipment(5, [3]);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    // Both options are offered, and they say different things: the rest turned up, or hand over
    // what did arrive.
    await expect(page.locator('button:has-text("تأكيد وصول الباقي")')).toBeVisible();
    await page.click('button:has-text("وضع جاهزة للاستلام")');

    const db = await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.status === "READY_FOR_PICKUP"
    );
    expect(db.status).toBe("READY_FOR_PICKUP");
    // Making it collectable must not have touched the missing carton.
    expect((await cartonsOf(shipment.id)).find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");

    await cleanupTenant(tenant.company.id);
  });

  test("company isolation: another tenant cannot hand over this shipment", async ({ page }) => {
    const { tenant, shipment } = await shortShipment(4, [2]);
    await markReadyForPickup(shipment.id);
    const outsider = await createTestTenant();

    await login(page, outsider.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expect(page.locator('button:has-text("تسليم من الفرع")')).toHaveCount(0);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("READY_FOR_PICKUP");
    expect(db.deliveredAt).toBeNull();

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });
});
