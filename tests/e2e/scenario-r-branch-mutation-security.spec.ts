import { test, expect } from "@playwright/test";
import {
  prisma,
  createTestTenant,
  createTestShipment,
  createTestTrip,
  createBranchScopedUser,
  login,
  cleanupTenant,
} from "./helpers";
import { assertOwnsShipment } from "../../src/modules/shipments/service";
import { assertTripInCompany, assertStopInCompany } from "../../src/modules/trips/service";
import { getOrCreateCustomsCase, updateCustomsStatus } from "../../src/modules/customs/service";
import { saveDocument } from "../../src/modules/documents/service";
import { createDeliveryRequest, markOutForDelivery, markDelivered } from "../../src/modules/delivery/service";

/**
 * Phase 5 P0 close-out (round 2) — branch scoping must hold at the MUTATION layer, not just
 * list/detail visibility. Every test here calls the real service-layer authorization function
 * directly (same pattern as whatsapp-notifications.spec.ts) with a constructed Branch-Employee
 * user object and an entity id that belongs to a DIFFERENT branch — simulating "an attacker who
 * knows the id and skips the UI entirely," which is exactly the threat model that matters: the UI
 * already 404s on the page, so the real question is whether the server call underneath is safe on
 * its own, independent of any page ever rendering.
 */
test.describe("Scenario R — branch-scoped mutation authorization (bypasses the UI, targets ids directly)", () => {
  test("shipment mutations: a Branch Employee cannot act on a shipment outside their branch, even knowing its id", async () => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;

    const shipmentAtA = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1 });
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1 });

    const employeeAtA = { userType: "COMPANY_USER", companyId: tenant.company.id, role: { name: "موظف فرع" }, branchId: branchA.id };

    // Negative: shipment never touches branch A.
    await expect(assertOwnsShipment(employeeAtA, shipmentAtB.id)).rejects.toThrow(/FORBIDDEN/);
    // Positive control: same employee, same shipment they SHOULD be able to reach.
    await expect(assertOwnsShipment(employeeAtA, shipmentAtA.id)).resolves.toBeTruthy();

    // Company Admin bypass: unaffected regardless of branch.
    const admin = { userType: "COMPANY_USER", companyId: tenant.company.id, role: { name: "مدير الشركة" }, branchId: null };
    await expect(assertOwnsShipment(admin, shipmentAtB.id)).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("shipment creation: a Branch Employee cannot intake a shipment claiming a different load branch", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { shipments: ["view", "create"] },
    });

    await login(page, employee.email);
    await page.goto("/app/shipments");
    await page.click('button:has-text("شحنة جديدة")');
    await page.fill('input[name="customerName"]', "عميل اختبار");
    await page.fill('input[name="customerPhone"]', "+967711000000");
    const comboboxes = page.locator('[role="dialog"] button[role="combobox"]');
    await comboboxes.nth(0).click(); // فرع التحميل — pick branch B, NOT the employee's own branch A
    await page.locator(`[role="option"]:has-text("${branchB.name}")`).click();
    await comboboxes.nth(1).click(); // فرع التفريغ
    await page.locator(`[role="option"]:has-text("${branchA.name}")`).click();
    await page.fill('input[name="cartonCount"]', "1");
    await page.click('[role="dialog"] button:has-text("حفظ")');

    await expect(page.locator("text=لا يمكنك تسجيل شحنة من فرع غير فرعك")).toBeVisible();
    // Never created.
    const count = await prisma.shipment.count({ where: { companyId: tenant.company.id } });
    expect(count).toBe(0);

    await cleanupTenant(tenant.company.id);
  });

  test("trip mutations: a Branch Employee cannot act on a trip or stop outside their branch", async () => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;

    const tripAtA = await createTestTrip({ companyId: tenant.company.id, stops: [{ branchId: branchA.id, loadingEnabled: true, unloadingEnabled: false }, { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true }] });
    const tripAtB = await createTestTrip({ companyId: tenant.company.id, stops: [{ branchId: branchB.id, loadingEnabled: true, unloadingEnabled: false }, { branchId: branchC.id, loadingEnabled: false, unloadingEnabled: true }] });
    const stopAtB = tripAtB.stops[0];

    // Negative: trip never touches branch A.
    await expect(assertTripInCompany(tenant.company.id, tripAtB.id, branchA.id)).rejects.toThrow(/FORBIDDEN/);
    // Positive control.
    await expect(assertTripInCompany(tenant.company.id, tripAtA.id, branchA.id)).resolves.toBeTruthy();

    // Stop-level: exact match required, not "touches" — a stop physically at branch B is off-limits
    // to a branch-A employee even though it's a perfectly valid company stop.
    await expect(assertStopInCompany(tenant.company.id, stopAtB.id, tripAtB.id, branchA.id)).rejects.toThrow(/FORBIDDEN/);
    await expect(assertStopInCompany(tenant.company.id, tripAtA.stops[0].id, tripAtA.id, branchA.id)).resolves.toBeTruthy();

    // Company-wide (no branch scope) reaches both.
    await expect(assertTripInCompany(tenant.company.id, tripAtB.id, null)).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("trip creation: a Branch Employee cannot create a trip that never touches their own branch", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { trips: ["view", "create"] },
    });

    await login(page, employee.email);
    await page.goto("/app/trips");
    await page.click('button:has-text("رحلة جديدة")');
    // combobox 0 is the driver select — stop selects start at index 1.
    const stopSelects = page.locator('button[role="combobox"]');
    // Two stops, both branch B and branch C — neither is the employee's own branch A.
    await stopSelects.nth(1).click();
    await page.locator(`[role="option"]:has-text("${branchB.name}")`).click();
    await stopSelects.nth(2).click();
    await page.locator(`[role="option"]:has-text("${branchC.name}")`).click();
    await page.click('button:has-text("إنشاء الرحلة")');

    await expect(page.locator("text=يجب أن تتضمن الرحلة فرعك")).toBeVisible();
    const count = await prisma.trip.count({ where: { companyId: tenant.company.id } });
    expect(count).toBe(0);

    await cleanupTenant(tenant.company.id);
  });

  test("customs mutations: a Branch Employee cannot open or update a customs case for a shipment outside their branch", async () => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1 });
    const shipmentAtA = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1 });

    await expect(getOrCreateCustomsCase(tenant.company.id, shipmentAtB.id, branchA.id)).rejects.toThrow(/FORBIDDEN/);
    const legitCase = await getOrCreateCustomsCase(tenant.company.id, shipmentAtA.id, branchA.id);
    expect(legitCase).toBeTruthy();

    // An existing case belonging to an out-of-branch shipment must also reject status updates.
    const caseAtB = await prisma.customsCase.create({ data: { companyId: tenant.company.id, shipmentId: shipmentAtB.id } });
    await expect(updateCustomsStatus(tenant.company.id, caseAtB.id, "DOCUMENTS_REQUIRED", { branchScope: branchA.id })).rejects.toThrow(/FORBIDDEN/);
    await expect(updateCustomsStatus(tenant.company.id, legitCase.id, "DOCUMENTS_REQUIRED", { branchScope: branchA.id })).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("document upload: a Branch Employee cannot attach a file to a shipment outside their branch", async () => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1 });

    const file = new File([Buffer.from("test content")], "test.txt", { type: "text/plain" });
    await expect(
      saveDocument({ companyId: tenant.company.id, shipmentId: shipmentAtB.id, docType: "OTHER", file, branchScope: branchA.id })
    ).rejects.toThrow(/FORBIDDEN/);

    const count = await prisma.document.count({ where: { shipmentId: shipmentAtB.id } });
    expect(count).toBe(0);

    await cleanupTenant(tenant.company.id);
  });

  test("delivery mutations: a Branch Employee cannot request or progress a delivery pickup at a branch that isn't theirs", async () => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    // currentBranchId = B -> pickupBranchId will resolve to B, not the employee's branch A.
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchC.id, unloadBranchId: branchB.id, cartonCount: 1, status: "ARRIVED" });
    await prisma.shipment.update({ where: { id: shipmentAtB.id }, data: { currentBranchId: branchB.id } });

    await expect(
      createDeliveryRequest({ companyId: tenant.company.id, shipmentId: shipmentAtB.id, destinationAddress: "حي تجريبي", branchScope: branchA.id })
    ).rejects.toThrow(/FORBIDDEN/);
    expect(await prisma.deliveryRequest.count({ where: { shipmentId: shipmentAtB.id } })).toBe(0);

    // An existing request already pickup-scoped to branch B must also reject progression by a
    // branch-A employee, even with a perfectly valid request id. DeliveryRequest.shipmentId is
    // unique, so each transition gets its own shipment+request fixture (mirroring
    // markOutForDelivery/markDelivered driving the shipment's own state machine
    // ARRIVED -> DELIVERY_REQUESTED -> OUT_FOR_DELIVERY -> DELIVERED, same as a real
    // createDeliveryRequest flow would have already done).
    async function makeReqAtB(shipmentStatus: string, requestStatus: string) {
      const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchC.id, unloadBranchId: branchB.id, cartonCount: 1, status: shipmentStatus });
      const req = await prisma.deliveryRequest.create({
        data: {
          companyId: tenant.company.id,
          shipmentId: shipment.id,
          customerName: "عميل",
          customerPhone: "+967700000000",
          pickupBranchId: branchB.id,
          destinationAddress: "حي تجريبي",
          cartonCount: 1,
          status: requestStatus,
        },
      });
      return req;
    }

    // Proof of delivery is required to close a handover now; the branch rule under test is
    // enforced before it, so a valid proof keeps this focused on the branch check alone.
    const PROOF = { receivedByName: "مستلم اختبار", last4: "0000" };

    const reqForOutForDelivery = await makeReqAtB("DELIVERY_REQUESTED", "ASSIGNED");
    await expect(markOutForDelivery(tenant.company.id, reqForOutForDelivery.id, undefined, branchA.id)).rejects.toThrow();
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: reqForOutForDelivery.id } })).status).toBe("ASSIGNED");
    // Same request, correct branch — succeeds.
    await expect(markOutForDelivery(tenant.company.id, reqForOutForDelivery.id, undefined, branchB.id)).resolves.toBeTruthy();

    const reqForDelivered = await makeReqAtB("OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY");
    await expect(markDelivered(tenant.company.id, reqForDelivered.id, PROOF, undefined, branchA.id)).rejects.toThrow();
    expect((await prisma.deliveryRequest.findUniqueOrThrow({ where: { id: reqForDelivered.id } })).status).toBe("OUT_FOR_DELIVERY");
    // Same request, correct branch — succeeds.
    await expect(markDelivered(tenant.company.id, reqForDelivered.id, PROOF, undefined, branchB.id)).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });
});
