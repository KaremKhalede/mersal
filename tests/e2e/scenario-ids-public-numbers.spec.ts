import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, createTestShipment, cleanupTenant } from "./helpers";
import { nextShipmentNumber, nextTripNumber, nextInvoiceNumber, nextPublicNumber } from "../../src/lib/ids";
import { createShipment } from "../../src/modules/shipments/service";

/**
 * P0-2 regression suite — public document numbers.
 *
 * The previous generator picked a random 5-digit number and retried up to 20 times against a
 * uniqueness check. That capped the platform at 89,999 shipments GLOBALLY, and started rejecting
 * roughly one creation in ten well before the cap was reached. These tests pin the replacement
 * (a Postgres sequence, see src/lib/ids.ts) to the properties that actually matter: no collisions,
 * no luck, no ceiling.
 */

const FORMAT = { shipment: /^SH-\d+$/, trip: /^TR-\d+$/, invoice: /^INV-\d+$/ };

function suffix(n: string): bigint {
  return BigInt(n.slice(n.indexOf("-") + 1));
}

test.describe("Scenario IDs — public number allocation (P0-2)", () => {
  test("allocating 2,000 numbers in a row yields 2,000 distinct, well-formed values", async () => {
    test.setTimeout(180_000);
    const numbers: string[] = [];
    for (let i = 0; i < 2000; i++) numbers.push(await nextShipmentNumber());

    expect(new Set(numbers).size).toBe(2000);
    for (const n of numbers) expect(n).toMatch(FORMAT.shipment);
  });

  test("a concurrent burst never collides — the old scheme's core failure", async () => {
    // 300 simultaneous allocations. Under the random-retry generator this was exactly the shape
    // that produced duplicates and "تعذّر توليد رقم فريد" errors; nextval() is atomic.
    const numbers = await Promise.all(Array.from({ length: 300 }, () => nextShipmentNumber()));
    expect(new Set(numbers).size).toBe(300);
    for (const n of numbers) expect(n).toMatch(FORMAT.shipment);
  });

  test("numbers increase monotonically, so they are also chronological", async () => {
    const a = suffix(await nextShipmentNumber());
    const b = suffix(await nextShipmentNumber());
    const c = suffix(await nextShipmentNumber());
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  test("allocation cost does not depend on how many rows already exist (no ceiling, no degradation)", async () => {
    // The old generator's collision probability — and therefore its failure rate — grew with the
    // number of rows. This one is a single atomic call regardless.
    const before = Date.now();
    await Promise.all(Array.from({ length: 200 }, () => nextShipmentNumber()));
    const elapsed = Date.now() - before;
    expect(elapsed).toBeLessThan(30_000);
  });

  test("every prefix has its own independent sequence", async () => {
    const [s, t, i] = await Promise.all([nextShipmentNumber(), nextTripNumber(), nextInvoiceNumber()]);
    expect(s).toMatch(FORMAT.shipment);
    expect(t).toMatch(FORMAT.trip);
    expect(i).toMatch(FORMAT.invoice);
    // Trip and invoice counters are not dragged along by shipment volume.
    const t2 = suffix(await nextTripNumber());
    expect(t2).toBe(suffix(t) + BigInt(1));
  });

  test("generated numbers never fall inside the legacy 5-digit range", async () => {
    // Legacy values are SH-10000..SH-99999. Sequences start at 100000 precisely so old rows and new
    // allocations can coexist with no backfill and no risk of a duplicate.
    for (const kind of ["shipment", "trip", "invoice"] as const) {
      const n = await nextPublicNumber(kind);
      expect(suffix(n)).toBeGreaterThanOrEqual(BigInt(100000));
    }
  });

  test("concurrently created shipments all persist with distinct numbers and matching carton codes", async () => {
    test.setTimeout(120_000);
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [load, unload] = tenant.branches;

    const created = await Promise.all(
      Array.from({ length: 25 }, () =>
        createShipment({
          companyId: tenant.company.id,
          customerId: tenant.customerId,
          receiverName: "مستلم",
          receiverPhone: "+967700000000",
          loadBranchId: load.id,
          unloadBranchId: unload.id,
          cartonCount: 2,
        })
      )
    );

    const numbers = created.map((s) => s.shipmentNumber);
    expect(new Set(numbers).size).toBe(25);
    for (const n of numbers) expect(n).toMatch(FORMAT.shipment);

    // Carton codes are derived from the shipment number, so they inherit its uniqueness.
    const cartons = await prisma.carton.findMany({
      where: { shipmentId: { in: created.map((s) => s.id) } },
      select: { cartonCode: true },
    });
    expect(cartons).toHaveLength(50);
    expect(new Set(cartons.map((c) => c.cartonCode)).size).toBe(50);

    await cleanupTenant(tenant.company.id);
  });

  test("a shipment is still found by its number — search and lookups are unaffected", async ({ page }) => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [load, unload] = tenant.branches;
    const shipment = await createShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      receiverName: "مستلم",
      receiverPhone: "+967700000000",
      loadBranchId: load.id,
      unloadBranchId: unload.id,
      cartonCount: 1,
    });

    const found = await prisma.shipment.findUnique({ where: { shipmentNumber: shipment.shipmentNumber } });
    expect(found?.id).toBe(shipment.id);

    // And through the app's own global search, which upper-cases the query.
    const { login } = await import("./helpers");
    await login(page, tenant.adminEmail);
    await page.goto(`/app/search?q=${encodeURIComponent(shipment.shipmentNumber)}`);
    await expect(page.locator(`text=${shipment.shipmentNumber}`).first()).toBeVisible();

    await cleanupTenant(tenant.company.id);
  });

  test("legacy 5-digit numbers still resolve — existing shipments are not broken", async () => {
    const tenant = await createTestTenant(["الرياض", "المكلا"]);
    const [load, unload] = tenant.branches;
    const shipment = await createTestShipment({
      companyId: tenant.company.id,
      customerId: tenant.customerId,
      loadBranchId: load.id,
      unloadBranchId: unload.id,
      cartonCount: 1,
    });
    // Rewrite it to the old shape, exactly as a pre-migration row would look.
    await prisma.shipment.update({ where: { id: shipment.id }, data: { shipmentNumber: "SH-54321" } });

    const found = await prisma.shipment.findUnique({ where: { shipmentNumber: "SH-54321" } });
    expect(found?.id).toBe(shipment.id);

    // A freshly generated number cannot collide with it.
    const fresh = await nextShipmentNumber();
    expect(fresh).not.toBe("SH-54321");
    expect(suffix(fresh)).toBeGreaterThan(BigInt(99999));

    await cleanupTenant(tenant.company.id);
  });
});
