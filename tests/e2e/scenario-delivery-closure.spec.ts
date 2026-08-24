import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createBranchScopedUser, login, cleanupTenant, pollUntil, expectNotFound } from "./helpers";
import { failDelivery, cancelDeliveryRequest, createDeliveryRequest, requestDeliveryFromCustomer, markOutForDelivery, markDelivered } from "@/modules/delivery/service";

/**
 * P1-8: a delivery request had exactly one way to end — a successful handover. A customer who was
 * not home left the request OUT_FOR_DELIVERY forever, and the shipment could only escape through an
 * exception, leaving two records that disagreed about the same shipment.
 *
 * P1-9: PARTIALLY_ARRIVED became a normal collectable state in P0-4, but the customer's own tracking
 * page and the office's delivery panel still refused it.
 */

async function arrivedShipment(status = "ARRIVED") {
  const tenant = await createTestTenant(["الرياض", "المكلا"]);
  const [origin, destination] = tenant.branches;
  const shipment = await createTestShipment({
    companyId: tenant.company.id,
    customerId: tenant.customerId,
    loadBranchId: origin.id,
    unloadBranchId: destination.id,
    cartonCount: 3,
    status,
    receiverPhone: "+967771234567",
  });
  await prisma.shipment.update({ where: { id: shipment.id }, data: { currentBranchId: destination.id } });
  return { tenant, shipment, origin, destination };
}

/** A shipment already out for delivery, through the real service path. */
async function outForDelivery() {
  const { tenant, shipment, destination } = await arrivedShipment();
  const request = await createDeliveryRequest({
    companyId: tenant.company.id,
    shipmentId: shipment.id,
    destinationAddress: "حي تجريبي، شارع 5",
  });
  await markOutForDelivery(tenant.company.id, request.id);
  return { tenant, shipment, request, destination };
}

test.describe("P1-8 — delivery failure", () => {
  test("a failed delivery closes the request and puts the shipment back on the counter", async () => {
    const { tenant, shipment, request } = await outForDelivery();

    await failDelivery(tenant.company.id, request.id);

    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("FAILED");
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("READY_FOR_PICKUP");
    // Not a delivery: no proof, no delivered cartons.
    expect(db.deliveredAt).toBeNull();
    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id } });
    expect(cartons.every((c) => c.status !== "DELIVERED")).toBe(true);

    await cleanupTenant(tenant.company.id);
  });

  test("a failed request cannot then be confirmed as delivered", async () => {
    const { tenant, shipment, request } = await outForDelivery();
    await failDelivery(tenant.company.id, request.id);

    await expect(
      markDelivered(tenant.company.id, request.id, { receivedByName: "محمد", last4: "4567" })
    ).rejects.toThrow(/لا يسمح بتأكيد التسليم/);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(tenant.company.id);
  });

  test("the office can raise a fresh delivery request after a failure", async () => {
    const { tenant, shipment, request } = await outForDelivery();
    await failDelivery(tenant.company.id, request.id);

    // DeliveryRequest.shipmentId is unique, so a retry reuses the row rather than stacking history —
    // deliberately no attempts log.
    await prisma.deliveryRequest.delete({ where: { id: request.id } });
    const second = await createDeliveryRequest({
      companyId: tenant.company.id,
      shipmentId: shipment.id,
      destinationAddress: "عنوان جديد، شارع 9",
    });

    expect(second.status).toBe("ASSIGNED");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("DELIVERY_REQUESTED");

    await cleanupTenant(tenant.company.id);
  });

  test("failure is only legal while a delivery is actually under way", async () => {
    const { tenant, shipment } = await arrivedShipment();
    const request = await createDeliveryRequest({
      companyId: tenant.company.id,
      shipmentId: shipment.id,
      destinationAddress: "حي تجريبي",
    });

    // Still ASSIGNED — nothing left the branch, so "it failed" would be a false record.
    await expect(failDelivery(tenant.company.id, request.id)).rejects.toThrow(/لا يسمح بهذا الإجراء/);
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("ASSIGNED");

    await cleanupTenant(tenant.company.id);
  });

  test("the tracking timeline and the receiver's WhatsApp both say it is collectable again", async () => {
    const { tenant, shipment, request } = await outForDelivery();

    await failDelivery(tenant.company.id, request.id);

    const event = await prisma.trackingEvent.findFirstOrThrow({
      where: { shipmentId: shipment.id, eventType: "READY_FOR_PICKUP" },
    });
    expect(event.description).toContain("تعذّر التوصيل");

    // READY_FOR_PICKUP is receiver-routed (P1-1) and needs no new template.
    const log = await pollUntil(
      () => prisma.notificationLog.findFirst({ where: { shipmentId: shipment.id, event: "READY_FOR_PICKUP" } }),
      (l) => l !== null
    );
    expect(log!.recipient).toBe("RECEIVER");
    expect(log!.toPhone).toBe("+967771234567");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("P1-8 — delivery cancellation", () => {
  test("a customer-submitted request can be called off before review", async () => {
    const { tenant, shipment } = await arrivedShipment();
    await requestDeliveryFromCustomer({ shipmentId: shipment.id, destinationAddress: "حي تجريبي، شارع 5" });
    const request = await prisma.deliveryRequest.findFirstOrThrow({ where: { shipmentId: shipment.id } });
    expect(request.status).toBe("PENDING");

    await cancelDeliveryRequest(tenant.company.id, request.id);

    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("CANCELLED");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(tenant.company.id);
  });

  test("an assigned request can be called off while it is still at the branch", async () => {
    const { tenant, shipment } = await arrivedShipment();
    const request = await createDeliveryRequest({
      companyId: tenant.company.id,
      shipmentId: shipment.id,
      destinationAddress: "حي تجريبي",
    });
    expect(request.status).toBe("ASSIGNED");

    await cancelDeliveryRequest(tenant.company.id, request.id);

    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("CANCELLED");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY_FOR_PICKUP");

    await cleanupTenant(tenant.company.id);
  });

  test("a delivery already under way cannot be cancelled — it can only fail", async () => {
    const { tenant, request } = await outForDelivery();

    await expect(cancelDeliveryRequest(tenant.company.id, request.id)).rejects.toThrow(/لا يسمح بهذا الإجراء/);
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("OUT_FOR_DELIVERY");

    await cleanupTenant(tenant.company.id);
  });

  test("closing twice is refused, so two employees cannot double-close a request", async () => {
    const { tenant, request } = await outForDelivery();
    await failDelivery(tenant.company.id, request.id);

    await expect(failDelivery(tenant.company.id, request.id)).rejects.toThrow();
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("FAILED");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("P1-8 — isolation", () => {
  test("another company cannot close this request", async () => {
    const { tenant, shipment, request } = await outForDelivery();
    const outsider = await createTestTenant();

    await expect(failDelivery(outsider.company.id, request.id)).rejects.toThrow();
    await expect(cancelDeliveryRequest(outsider.company.id, request.id)).rejects.toThrow();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("OUT_FOR_DELIVERY");

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });

  test("a branch-scoped employee can only close their own branch's deliveries", async () => {
    const { tenant, request, destination } = await outForDelivery();

    await expect(failDelivery(tenant.company.id, request.id, undefined, tenant.branches[0].id)).rejects.toThrow();
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("OUT_FOR_DELIVERY");

    await expect(failDelivery(tenant.company.id, request.id, undefined, destination.id)).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("a role without shipments.updateStatus sees no closing buttons", async ({ page }) => {
    const { tenant, request } = await outForDelivery();
    const viewer = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: tenant.branches[1].id,
      permissions: { shipments: ["view"] },
    });

    await login(page, viewer.email);
    await page.goto("/app/delivery");
    await expect(page.locator('button:has-text("تعذّر التوصيل")')).toHaveCount(0);
    await expect(page.locator('button:has-text("إلغاء الطلب")')).toHaveCount(0);
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("OUT_FOR_DELIVERY");

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("P1-8 — screens", () => {
  test("desktop: the queue offers a close for every open state, and none once it is closed", async ({ page }) => {
    const { tenant, shipment, request } = await outForDelivery();

    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, tenant.adminEmail);
    await page.goto("/app/delivery");

    const row = page.locator(`tr:has-text("${shipment.shipmentNumber}")`).first();
    await expect(row.locator('button:has-text("تأكيد التوصيل")')).toBeVisible();
    await row.locator('button:has-text("تعذّر التوصيل")').click();

    await pollUntil(
      () => prisma.deliveryRequest.findUniqueOrThrow({ where: { id: request.id } }),
      (r) => r.status === "FAILED"
    );
    await page.reload();
    // No dead buttons on a closed request.
    const closedRow = page.locator(`tr:has-text("${shipment.shipmentNumber}")`).first();
    await expect(closedRow.locator('button:has-text("تأكيد التوصيل")')).toHaveCount(0);
    await expect(closedRow.locator('button:has-text("تعذّر التوصيل")')).toHaveCount(0);
    await expect(closedRow.locator("text=فشل التوصيل")).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("mobile: the shipment page explains the outcome in plain Arabic", async ({ page }) => {
    const { tenant, shipment, request } = await outForDelivery();
    await failDelivery(tenant.company.id, request.id);

    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("التوصيل")');

    await expect(page.locator("text=تعذّر التوصيل — الشحنة متاحة للاستلام من الفرع")).toBeVisible();
    // No technical status names anywhere on the screen.
    await expect(page.locator("text=FAILED")).toHaveCount(0);
    await expect(page.locator("text=READY_FOR_PICKUP")).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await cleanupTenant(tenant.company.id);
  });
});

test.describe("P1-9 — partial arrival alignment", () => {
  test("the customer can choose branch pickup for a shipment that arrived short", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("PARTIALLY_ARRIVED");
    await prisma.shipment.update({ where: { id: shipment.id }, data: { arrivedCartons: 2 } });

    await page.goto(`/t/${shipment.trackingToken}`);
    await expect(page.locator("text=وصل 2 من أصل 3 كراتين").first()).toBeVisible();
    await expect(page.locator("text=يمكنك استلام ما وصل من الفرع").first()).toBeVisible();

    await page.click('button:has-text("استلام من الفرع")');
    await page.fill('input[name="last4"]', "4567");
    await page.click('button:has-text("تأكيد")');

    await pollUntil(
      () => prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } }),
      (s) => s.deliveryMethod === "PICKUP"
    );

    await cleanupTenant(tenant.company.id);
  });

  test("the customer can request home delivery for a shipment that arrived short", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("PARTIALLY_ARRIVED");

    await page.goto(`/t/${shipment.trackingToken}`);
    await page.click('button:has-text("توصيل للمنزل")');
    await page.fill('textarea[name="destinationAddress"]', "المكلا، حي السلام، شارع 12");
    await page.fill('input[name="last4"]', "4567");
    await page.click('button:has-text("تأكيد طلب التوصيل")');

    const request = await pollUntil(
      () => prisma.deliveryRequest.findFirst({ where: { shipmentId: shipment.id } }),
      (r) => r !== null
    );
    expect(request!.status).toBe("PENDING");
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("DELIVERY_REQUESTED");

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment that has not arrived still cannot have its handover method changed", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("IN_TRANSIT");

    await page.goto(`/t/${shipment.trackingToken}`);
    // The choice is not even offered — the page mirrors the server rather than letting the customer
    // tap something that will be refused.
    await expect(page.locator('button:has-text("استلام من الفرع")')).toHaveCount(0);
    await expect(page.locator('button:has-text("توصيل للمنزل")')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("the last-4 credential is still required for a partially arrived shipment", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("PARTIALLY_ARRIVED");

    await page.goto(`/t/${shipment.trackingToken}`);
    await page.click('button:has-text("استلام من الفرع")');
    await page.fill('input[name="last4"]', "0000");
    await page.click('button:has-text("تأكيد")');

    await expect(page.locator("text=تعذّر التحقق").first()).toBeVisible();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).deliveryMethod).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("direct URL access with a wrong token reveals nothing about a partial shipment", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("PARTIALLY_ARRIVED");

    await page.goto("/t/definitely-not-a-real-token");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain(shipment.shipmentNumber);
    expect(body).not.toContain(tenant.company.name);

    await cleanupTenant(tenant.company.id);
  });

  test("the office delivery panel offers what the server accepts for a partial shipment", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("PARTIALLY_ARRIVED");

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("التوصيل")');

    await expect(page.locator("text=وصل جزء من الشحنة فقط")).toBeVisible();
    await expect(page.locator('button:has-text("طلب توصيل إلى المنزل")')).toBeVisible();
    await expect(page.locator("text=التوصيل متاح بعد وصول الشحنة")).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment still in transit shows the panel's explanation, not a form", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("IN_TRANSIT");

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("التوصيل")');

    await expect(page.locator("text=التوصيل متاح بعد وصول الشحنة")).toBeVisible();
    await expect(page.locator('button:has-text("طلب توصيل إلى المنزل")')).toHaveCount(0);

    await cleanupTenant(tenant.company.id);
  });

  test("cross-tenant: another company cannot open this shipment at all", async ({ page }) => {
    const { tenant, shipment } = await arrivedShipment("PARTIALLY_ARRIVED");
    const outsider = await createTestTenant();

    await login(page, outsider.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expectNotFound(page, [shipment.shipmentNumber]);

    await cleanupTenant(outsider.company.id);
    await cleanupTenant(tenant.company.id);
  });
});
