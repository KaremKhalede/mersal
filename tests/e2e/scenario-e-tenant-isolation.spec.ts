import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, createTestTrip, login, cleanupTenant } from "./helpers";

test.describe("Scenario E — cross-tenant access must be rejected server-side", () => {
  test("company A cannot read company B's shipment, customer, trip, or document", async ({ page }) => {
    const tenantA = await createTestTenant(["أ1", "أ2"]);
    const tenantB = await createTestTenant(["ب1", "ب2"]);

    const shipmentB = await createTestShipment({
      companyId: tenantB.company.id,
      customerId: tenantB.customerId,
      loadBranchId: tenantB.branches[0].id,
      unloadBranchId: tenantB.branches[1].id,
      cartonCount: 2,
    });
    const tripB = await createTestTrip({
      companyId: tenantB.company.id,
      stops: [
        { branchId: tenantB.branches[0].id, loadingEnabled: true, unloadingEnabled: false },
        { branchId: tenantB.branches[1].id, loadingEnabled: false, unloadingEnabled: true },
      ],
    });
    const docB = await prisma.document.create({
      data: { companyId: tenantB.company.id, shipmentId: shipmentB.id, docType: "OTHER", fileName: "secret.txt", filePath: `${tenantB.company.id}/does-not-matter.txt` },
    });

    await login(page, tenantA.adminEmail);

    // Read paths: every one of these must 404, never render tenant B's data
    const res1 = await page.goto(`/app/shipments/${shipmentB.id}`);
    expect(res1?.status()).toBe(404);

    const res2 = await page.goto(`/app/customers/${tenantB.customerId}`);
    expect(res2?.status()).toBe(404);

    const res3 = await page.goto(`/app/trips/${tripB.id}`);
    expect(res3?.status()).toBe(404);

    const docRes = await page.request.get(`/api/documents/${docB.id}`);
    expect(docRes.status()).toBe(404);

    await cleanupTenant(tenantA.company.id);
    await cleanupTenant(tenantB.company.id);
  });
});
