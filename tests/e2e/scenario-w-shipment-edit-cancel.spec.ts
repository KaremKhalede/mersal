import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createBranchScopedUser, login, cleanupTenant } from "./helpers";
import { updateShipmentDetails, cancelDraftShipment } from "../../src/modules/shipments/service";

/** Phase 5 P1 batch 2, item 2 — edit/cancel for DRAFT/REGISTERED shipments only. */
test.describe("Scenario W — shipment edit and cancel (DRAFT/REGISTERED only)", () => {
  test("editing a REGISTERED shipment through the UI updates the intended fields and nothing else", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;

    await login(page, tenant.adminEmail);
    await page.goto("/app/shipments");
    await page.click('button:has-text("شحنة جديدة")');
    await page.fill('input[name="customerName"]', "عميل التعديل");
    await page.fill('input[name="customerPhone"]', "+967711000001");
    const comboboxes = page.locator('[role="dialog"] button[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.locator(`[role="option"]:has-text("${branchA.name}")`).click();
    await comboboxes.nth(1).click();
    await page.locator(`[role="option"]:has-text("${branchB.name}")`).click();
    await page.fill('input[name="cartonCount"]', "2");
    await page.click('[role="dialog"] button:has-text("حفظ")');
    await page.waitForURL(/\/app\/shipments\//);
    const shipmentId = page.url().split("/shipments/")[1];

    const before = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(before.status).toBe("REGISTERED");
    const cartonsBefore = await prisma.carton.findMany({ where: { shipmentId } });

    await page.click('button:has-text("تعديل")');
    await page.fill('input[name="receiverName"]', "مستلم جديد");
    await page.fill('input[name="receiverPhone"]', "+967779999999");
    await page.fill('input[name="shippingPrice"]', "1500");
    await page.click('[role="dialog"] button:has-text("حفظ التعديلات")');
    await expect(page.locator("text=مستلم جديد")).toBeVisible();

    const after = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    expect(after.receiverName).toBe("مستلم جديد");
    expect(after.receiverPhone).toBe("+967779999999");
    expect(Number(after.shippingPrice)).toBe(1500);
    // Untouched: identity, branches, carton count/codes, status.
    expect(after.shipmentNumber).toBe(before.shipmentNumber);
    expect(after.loadBranchId).toBe(before.loadBranchId);
    expect(after.unloadBranchId).toBe(before.unloadBranchId);
    expect(after.totalCartons).toBe(before.totalCartons);
    expect(after.status).toBe("REGISTERED");
    const cartonsAfter = await prisma.carton.findMany({ where: { shipmentId } });
    expect(cartonsAfter.map((c) => c.cartonCode)).toEqual(cartonsBefore.map((c) => c.cartonCode));

    await cleanupTenant(tenant.company.id);
  });

  test("cancelling a REGISTERED shipment moves it straight to CANCELLED, no exception detour", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1, status: "REGISTERED" });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("إلغاء")');
    await page.click('[role="dialog"] button:has-text("تأكيد")');

    await expect
      .poll(async () => (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status)
      .toBe("CANCELLED");

    // No exception fields were ever touched — this bypassed that flow entirely.
    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.exceptionType).toBeNull();
    expect(db.statusBeforeException).toBeNull();

    await cleanupTenant(tenant.company.id);
  });

  test("neither edit nor cancel is offered once a shipment has moved past REGISTERED", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1, status: "RECEIVED" });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}`);
    await expect(page.locator('button:has-text("تعديل")')).toHaveCount(0);
    await expect(page.locator('button:has-text("إلغاء")')).toHaveCount(0);

    // Bypassing the UI entirely and calling the service functions directly must still reject it —
    // the button being hidden is not the real security boundary.
    await expect(updateShipmentDetails(tenant.company.id, shipment.id, { receiverName: "x", receiverPhone: "y" })).rejects.toThrow();
    await expect(cancelDraftShipment(tenant.company.id, shipment.id)).rejects.toThrow();

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    expect(db.status).toBe("RECEIVED"); // unchanged

    await cleanupTenant(tenant.company.id);
  });

  test("a Branch Employee cannot edit or cancel a shipment outside their branch, even knowing its id — enforced inside the service functions themselves, not just a caller pre-check", async () => {
    const tenant = await createTestTenant(["أ", "ب", "ج"]);
    const [branchA, branchB, branchC] = tenant.branches;
    const shipmentAtB = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchB.id, unloadBranchId: branchC.id, cartonCount: 1, status: "REGISTERED" });

    // Bypasses the UI AND the actions.ts layer entirely — calls updateShipmentDetails/
    // cancelDraftShipment directly with an out-of-branch scope, proving THEY are the real gate now
    // (production-readiness cleanup), not a formality the caller has to remember to run first.
    await expect(
      updateShipmentDetails(tenant.company.id, shipmentAtB.id, { receiverName: "x", receiverPhone: "y" }, { branchScope: branchA.id })
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      cancelDraftShipment(tenant.company.id, shipmentAtB.id, { branchScope: branchA.id })
    ).rejects.toThrow(/FORBIDDEN/);

    const db = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentAtB.id } });
    expect(db.status).toBe("REGISTERED"); // unchanged
    expect(db.receiverName).not.toBe("x");

    // Cross-tenant on top of cross-branch: a shipment belonging to a different company entirely
    // must also be rejected (assertSameCompany), independent of any branch scope at all.
    const otherTenant = await createTestTenant(["د"]);
    await expect(
      updateShipmentDetails(otherTenant.company.id, shipmentAtB.id, { receiverName: "x", receiverPhone: "y" })
    ).rejects.toThrow();
    await expect(cancelDraftShipment(otherTenant.company.id, shipmentAtB.id)).rejects.toThrow();
    await cleanupTenant(otherTenant.company.id);

    // Positive control: the same employee, same shipment, correct branch — both succeed.
    const shipmentAtA = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchC.id, cartonCount: 1, status: "REGISTERED" });
    await expect(
      updateShipmentDetails(tenant.company.id, shipmentAtA.id, { receiverName: "مستلم صحيح", receiverPhone: "+967700000001" }, { branchScope: branchA.id })
    ).resolves.toBeTruthy();
    await expect(cancelDraftShipment(tenant.company.id, shipmentAtA.id, { branchScope: branchA.id })).resolves.toBeTruthy();

    await cleanupTenant(tenant.company.id);
  });

  test("branch-scoped employee with edit/cancel permission can manage a shipment inside their own branch", async ({ page }) => {
    const tenant = await createTestTenant(["أ", "ب"]);
    const [branchA, branchB] = tenant.branches;
    const shipment = await createTestShipment({ companyId: tenant.company.id, customerId: tenant.customerId, loadBranchId: branchA.id, unloadBranchId: branchB.id, cartonCount: 1, status: "REGISTERED" });
    const employee = await createBranchScopedUser({
      companyId: tenant.company.id,
      branchId: branchA.id,
      permissions: { shipments: ["view", "edit", "cancel"] },
    });

    await login(page, employee.email);
    await page.goto(`/app/shipments/${shipment.id}`);
    await page.click('button:has-text("إلغاء")');
    await page.click('[role="dialog"] button:has-text("تأكيد")');
    await expect
      .poll(async () => (await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status)
      .toBe("CANCELLED");

    await cleanupTenant(tenant.company.id);
  });
});
