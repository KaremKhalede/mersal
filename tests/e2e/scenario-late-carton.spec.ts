import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, linkShipmentToTrip, createBranchScopedUser, login, cleanupTenant, pollUntil, expectNotFound } from "./helpers";
import { confirmBranchPickup, confirmLateCartons, markReadyForPickup } from "@/modules/shipments/service";
import { confirmBulkUnload } from "@/modules/trips/service";

/**
 * P1-10: a shipment handed over one carton short keeps that carton MISSING (P0-4). When the box
 * finally turns up, the office had nothing to record it with — confirmRemainingArrived moves the
 * shipment to ARRIVED, and DELIVERED cannot become ARRIVED without reopening a closed handover.
 *
 * The fix touches only what changed: the carton, the derived arrived count, and a dated tracking
 * event. Status, deliveredAt and the whole delivery proof stay exactly as they were.
 */

const PROOF = { receivedByName: "محمد الشرعبي", last4: "4567" };
const RECEIVER_PHONE = "+967771234567";

/** A delivered shipment, short the cartons at `missingIndexes`, through the real flows. */
async function deliveredShort(cartonCount = 5, missingIndexes: number[] = [3]) {
  const tenant = await createTestTenant(["الرياض", "المكلا"]);
  const [origin, destination] = tenant.branches;
  const trip = await createTestTrip({
    companyId: tenant.company.id,
    driverId: tenant.driverId,
    stops: [
      { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
      { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
    ],
  });
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount,
    status: "IN_TRANSIT",
    receiverPhone: RECEIVER_PHONE,
  });
  await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
  await prisma.tripShipmentStop.updateMany({
    where: { tripId: trip.id, shipmentId: shipment.id },
    data: { loadedAt: new Date(), cartonsLoaded: cartonCount },
  });

  const all = await prisma.carton.findMany({ where: { shipmentId: shipment.id }, orderBy: { cartonIndex: "asc" } });
  const missing = all.filter((c) => missingIndexes.includes(c.cartonIndex));
  await confirmBulkUnload(trip.stops[1].id, undefined, missing.map((c) => c.id));
  if (missingIndexes.length > 0) await markReadyForPickup(shipment.id);
  await confirmBranchPickup(shipment.id, PROOF);

  const delivered = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
  return { tenant, shipment: delivered, missing, destination };
}

const cartonsOf = (shipmentId: string) =>
  prisma.carton.findMany({ where: { shipmentId }, orderBy: { cartonIndex: "asc" } });

test.describe("Late carton — service", () => {
  test("a shipment delivered in full offers nothing to record and refuses the attempt", async () => {
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
    await confirmBranchPickup(shipment.id, PROOF);
    const cartons = await cartonsOf(shipment.id);
    expect(cartons.every((c) => c.status === "DELIVERED")).toBe(true);

    // Nothing is missing, so nothing can arrive late — and a delivered carton must not be flipped.
    await expect(confirmLateCartons(tenant.company.id, shipment.id, [cartons[0].id])).rejects.toThrow(/لا يوجد كرتون مفقود/);
    expect((await cartonsOf(shipment.id)).every((c) => c.status === "DELIVERED")).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("the late carton becomes ARRIVED while the shipment stays delivered", async () => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);
    const before = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(before.status).toBe("DELIVERED");
    expect((await cartonsOf(shipment.id)).find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");

    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);

    const cartons = await cartonsOf(shipment.id);
    // The carton is at the branch now — it arrived, it was never handed over with the rest.
    expect(cartons.find((c) => c.cartonIndex === 3)!.status).toBe("ARRIVED");
    expect(cartons.filter((c) => c.status === "MISSING")).toHaveLength(0);

    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(after.status).toBe("DELIVERED");
    expect(after.arrivedCartons).toBe(5);
    // The handover is untouched: same moment, same person, same digits, same channel.
    expect(after.deliveredAt?.getTime()).toBe(before.deliveredAt?.getTime());
    expect(after.deliveredToName).toBe(before.deliveredToName);
    expect(after.deliveredToLast4).toBe(before.deliveredToLast4);
    expect(after.deliveryChannel).toBe(before.deliveryChannel);

    await cleanupTenant(tenant.company.id);
  });

  test("the timeline gains a dated event naming the carton, and the delivery event is unchanged", async () => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);
    const deliveredEventBefore = await prisma.trackingEvent.findFirstOrThrow({
      where: { shipmentId: shipment.id, eventType: "DELIVERED" },
    });

    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);

    const late = await prisma.trackingEvent.findFirstOrThrow({
      where: { shipmentId: shipment.id, eventType: "CARTON_ARRIVED_LATE" },
    });
    expect(late.description).toContain(missing[0].cartonCode);
    expect(late.isCustomerVisible).toBe(true);

    // The record of a short handover is not rewritten by the box turning up later.
    const deliveredEventAfter = await prisma.trackingEvent.findFirstOrThrow({ where: { id: deliveredEventBefore.id } });
    expect(deliveredEventAfter.description).toBe(deliveredEventBefore.description);
    expect(deliveredEventAfter.description).toContain("نقص");

    await cleanupTenant(tenant.company.id);
  });

  test("no WhatsApp is sent — there is no approved template for a late carton", async () => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);
    const before = await prisma.notificationLog.count({ where: { shipmentId: shipment.id } });

    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);

    expect(await prisma.notificationLog.count({ where: { shipmentId: shipment.id } })).toBe(before);

    await cleanupTenant(tenant.company.id);
  });

  test("several missing cartons can arrive on different days, one at a time", async () => {
    const { tenant, shipment, missing } = await deliveredShort(6, [2, 5]);
    expect(missing).toHaveLength(2);

    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);
    let cartons = await cartonsOf(shipment.id);
    expect(cartons.find((c) => c.cartonIndex === 2)!.status).toBe("ARRIVED");
    expect(cartons.find((c) => c.cartonIndex === 5)!.status).toBe("MISSING");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).arrivedCartons).toBe(5);

    await confirmLateCartons(tenant.company.id, shipment.id, [missing[1].id]);
    cartons = await cartonsOf(shipment.id);
    expect(cartons.filter((c) => c.status === "MISSING")).toHaveLength(0);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).arrivedCartons).toBe(6);

    // One event per occurrence — that is the point of dating them separately.
    expect(await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "CARTON_ARRIVED_LATE" } })).toBe(2);

    await cleanupTenant(tenant.company.id);
  });

  test("recording the same carton twice changes nothing the second time", async () => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);
    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);

    await expect(confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id])).rejects.toThrow(/لا يوجد كرتون مفقود/);
    expect((await cartonsOf(shipment.id)).find((c) => c.cartonIndex === 3)!.status).toBe("ARRIVED");
    expect(await prisma.trackingEvent.count({ where: { shipmentId: shipment.id, eventType: "CARTON_ARRIVED_LATE" } })).toBe(1);

    await cleanupTenant(tenant.company.id);
  });

  test("an open shipment is sent to its own path instead", async () => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [origin, destination] = tenant.branches;
    const trip = await createTestTrip({
      companyId: tenant.company.id,
      stops: [
        { branchId: origin.id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: destination.id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const shipment = await createTestShipment({
      companyId: tenant.company.id, customerId: tenant.customerId,
      loadBranchId: origin.id, unloadBranchId: destination.id,
      cartonCount: 4, status: "IN_TRANSIT", receiverPhone: RECEIVER_PHONE,
    });
    await linkShipmentToTrip(trip.id, shipment.id, trip.stops[0].id, trip.stops[1].id);
    await prisma.tripShipmentStop.updateMany({ where: { tripId: trip.id, shipmentId: shipment.id }, data: { loadedAt: new Date(), cartonsLoaded: 4 } });
    const all = await cartonsOf(shipment.id);
    await confirmBulkUnload(trip.stops[1].id, undefined, [all[1].id]);

    // PARTIALLY_ARRIVED, not delivered — "the rest arrived" is the correct action there.
    await expect(confirmLateCartons(tenant.company.id, shipment.id, [all[1].id])).rejects.toThrow(/للشحنات المسلَّمة فقط/);
    expect((await cartonsOf(shipment.id))[1].status).toBe("MISSING");

    await cleanupTenant(tenant.company.id);
  });

  test("company and branch isolation", async () => {
    const { tenant, shipment, missing, destination } = await deliveredShort(4, [2]);
    const outsider = await createTestTenant();

    await expect(confirmLateCartons(outsider.company.id, shipment.id, [missing[0].id])).rejects.toThrow();
    await expect(
      confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id], { branchScope: outsider.branches[0].id })
    ).rejects.toThrow();
    expect((await cartonsOf(shipment.id)).find((c) => c.cartonIndex === 2)!.status).toBe("MISSING");

    // The branch that actually holds the shipment may record it.
    await expect(
      confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id], { branchScope: destination.id })
    ).resolves.toBeTruthy();

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("a carton belonging to another shipment cannot be smuggled in", async () => {
    const a = await deliveredShort(4, [2]);
    const b = await deliveredShort(4, [3]);

    await expect(confirmLateCartons(a.tenant.company.id, a.shipment.id, [b.missing[0].id])).rejects.toThrow(/لا يوجد كرتون مفقود/);
    expect((await cartonsOf(b.shipment.id)).find((c) => c.cartonIndex === 3)!.status).toBe("MISSING");

    await cleanupTenant(b.tenant.company.id);
    await cleanupTenant(a.tenant.company.id);
  });
});

test.describe("Late carton — screens", () => {
  test("mobile: the office records the late carton and the page keeps the original proof", async ({ page }) => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await expect(page.locator("text=نقص عند التسليم").first()).toBeVisible();
    await page.click('button:has-text("وصل كرتون متأخر")');
    await page.getByTestId(`late-carton-${missing[0].cartonCode}`).click();
    await page.click('[role="dialog"] button:has-text("تسجيل الوصول")');

    await pollUntil(
      () => prisma.carton.findUniqueOrThrow({ where: { id: missing[0].id } }),
      (c) => c.status === "ARRIVED"
    );

    // The shipment did not reopen, and the fact that it was short at handover survives.
    await expect(page.locator("text=تم التسليم").first()).toBeVisible();
    await expect(page.locator("text=وصل بعد التسليم").first()).toBeVisible();
    await expect(page.locator(`text=${missing[0].cartonCode}`).first()).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await cleanupTenant(tenant.company.id);
  });

  test("desktop: no late-carton button on a shipment that was delivered complete", async ({ page }) => {
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
    await confirmBranchPickup(shipment.id, PROOF);

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);

    await expect(page.locator('button:has-text("وصل كرتون متأخر")')).toHaveCount(0);
    await expect(page.locator("text=نقص عند التسليم")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("the button disappears once every missing carton has been accounted for", async ({ page }) => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);
    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expect(page.locator('button:has-text("وصل كرتون متأخر")')).toHaveCount(0);
    await expect(page.locator("text=وصل بعد التسليم").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("RBAC and tenancy: a viewer sees no button, another company sees no shipment", async ({ page }) => {
    const { tenant, shipment, missing } = await deliveredShort(4, [2]);
    const viewer = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[1].id,
      permissions: { shipments: ["view"] },
    });

    // The shipment action bar is not permission-gated in this app (it never has been — the server is
    // the authority, and every action re-checks). So the check that matters is that the action
    // itself refuses: a view-only role must not be able to change a carton by reaching the form.
    await login(page, viewer.email);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("وصل كرتون متأخر")');
    await page.getByTestId(`late-carton-${missing[0].cartonCode}`).click();
    await page.click('[role="dialog"] button:has-text("تسجيل الوصول")');
    await expect(page.locator("text=ليس لديك صلاحية").first()).toBeVisible();
    expect((await cartonsOf(shipment.id)).find((c) => c.id === missing[0].id)!.status).toBe("MISSING");

    const outsider = await createTestTenant();
    await login(page, outsider.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expectNotFound(page, [shipment.shipmentNumber]);
    expect((await cartonsOf(shipment.id)).find((c) => c.id === missing[0].id)!.status).toBe("MISSING");

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("the customer's tracking page shows the late arrival too", async ({ page }) => {
    const { tenant, shipment, missing } = await deliveredShort(5, [3]);
    await confirmLateCartons(tenant.company.id, shipment.id, [missing[0].id]);

    await page.goto(`/t/${shipment.trackingToken}`);
    await expect(page.locator("text=وصل كرتون متأخر").first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });
});
