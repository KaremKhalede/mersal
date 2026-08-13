import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, login, cleanupTenant } from "./helpers";

/**
 * Phase 5 P1 batch 1, item 2 — one QR code per carton label.
 *
 * "QR data is correct" is verified via the `data-qr-value` attribute the label deliberately sets
 * alongside each rendered QR (exactly the value handed to the encoder for that carton) rather than
 * by decoding pixels back out of the rendered SVG — the `qrcode` package's own encoding correctness
 * isn't this codebase's concern to re-prove, same reason we don't re-test bcrypt's hashing.
 */
test.describe("Scenario T — carton label QR code", () => {
  test("one QR per carton, correct payload, existing label content untouched", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [loadBranch, unloadBranch] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: loadBranch.id,
      unloadBranchId: unloadBranch.id,
      cartonCount: 3,
    });
    await prisma.shipment.update({ where: { id: shipment.id }, data: { receiverName: "مستلم الملصق", receiverPhone: "+967799999999" } });
    const cartons = await prisma.carton.findMany({ where: { shipmentId: shipment.id }, orderBy: { cartonIndex: "asc" } });

    await login(page, tenant.adminEmail);
    await page.goto(`/app/shipments/${shipment.id}/label`);

    // Existing content — shipment number is still the dominant identifier, x/y, route, receiver.
    await expect(page.locator(`text=${shipment.shipmentNumber}`).first()).toBeVisible();
    await expect(page.locator("text=1 / 3")).toBeVisible();
    await expect(page.locator("text=2 / 3")).toBeVisible();
    await expect(page.locator("text=3 / 3")).toBeVisible();
    await expect(page.locator(`text=${loadBranch.name} ← ${unloadBranch.name}`).first()).toBeVisible();
    await expect(page.locator("text=مستلم الملصق").first()).toBeVisible();
    await expect(page.locator(`text=${tenant.company.name}`).first()).toBeVisible();

    // Exactly one QR wrapper per physical carton — never fewer, never duplicated.
    const qrWrappers = page.locator('[data-testid="carton-qr"]');
    await expect(qrWrappers).toHaveCount(3);

    // Each QR's declared payload matches that exact carton's own code, in label order.
    const qrValues = await qrWrappers.evaluateAll((els) => els.map((el) => el.getAttribute("data-qr-value")));
    expect(qrValues).toEqual(cartons.map((c) => c.cartonCode));
    // Sanity: cartonCode format itself is "{shipmentNumber}-C{index}", not some other identifier.
    expect(qrValues[0]).toBe(`${shipment.shipmentNumber}-C1`);

    // A real <svg> was actually rendered inside each wrapper, not an empty/broken encode.
    for (let i = 0; i < 3; i++) {
      const svg = qrWrappers.nth(i).locator("svg");
      await expect(svg).toBeVisible();
    }

    await cleanupTenant(tenant.company.id);
  });
});
