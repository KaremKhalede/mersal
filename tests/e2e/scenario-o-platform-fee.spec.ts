import { test, expect } from "@playwright/test";
import { prisma, createTestTenant, cleanupTenant } from "./helpers";
import { chargeCartonFee } from "../../src/modules/billing/service";
import { createShipment } from "../../src/modules/shipments/service";
import { PLATFORM_ID } from "../../src/lib/platform";

// Platform.feePerCartonYER is a single global row shared by every tenant. workers:1 (see
// playwright.config.ts) keeps the whole suite sequential, so temporarily changing it here and
// restoring it in `finally` is safe — no other test can observe the changed value mid-flight.
test.describe("Scenario O — the configured platform fee is what shipments are actually charged", () => {
  test("chargeCartonFee reads Platform.feePerCartonYER, not a hardcoded rate", async () => {
    const original = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });
    const tenant = await createTestTenant(["أ", "ب"]);

    try {
      await prisma.platform.update({ where: { id: PLATFORM_ID }, data: { feePerCartonYER: 12 } });

      const shipment = await createShipment({
        companyId: tenant.company.id,
        customerId: tenant.customerId,
        receiverName: "مستلم",
        receiverPhone: "+967700000000",
        loadBranchId: tenant.branches[0].id,
        unloadBranchId: tenant.branches[1].id,
        cartonCount: 3,
      });

      const entry = await prisma.billingLedgerEntry.findFirstOrThrow({ where: { shipmentId: shipment.id, entryType: "CARTON_FEE" } });
      expect(Number(entry.feePerCarton)).toBe(12);
      expect(Number(entry.amount)).toBe(36);
    } finally {
      await prisma.platform.update({ where: { id: PLATFORM_ID }, data: { feePerCartonYER: original.feePerCartonYER } });
      await cleanupTenant(tenant.company.id);
    }
  });

  test("changing the platform fee never rewrites a ledger entry already charged at the old rate", async () => {
    const original = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });
    const tenant = await createTestTenant(["أ", "ب"]);

    try {
      await prisma.platform.update({ where: { id: PLATFORM_ID }, data: { feePerCartonYER: 5 } });
      const oldShipment = await createShipment({
        companyId: tenant.company.id,
        customerId: tenant.customerId,
        receiverName: "مستلم قديم",
        receiverPhone: "+967700000001",
        loadBranchId: tenant.branches[0].id,
        unloadBranchId: tenant.branches[1].id,
        cartonCount: 4,
      });
      const oldEntry = await prisma.billingLedgerEntry.findFirstOrThrow({ where: { shipmentId: oldShipment.id, entryType: "CARTON_FEE" } });
      expect(Number(oldEntry.feePerCarton)).toBe(5);
      expect(Number(oldEntry.amount)).toBe(20);

      // Rate changes after the fact — a real platform-admin action, not a data migration.
      await prisma.platform.update({ where: { id: PLATFORM_ID }, data: { feePerCartonYER: 9 } });

      // Re-charging the same (already-charged) shipment must stay a no-op — the append-only guard
      // in chargeCartonFee, unaffected by the rate change.
      await chargeCartonFee(oldShipment.id);
      const oldEntryAfter = await prisma.billingLedgerEntry.findMany({ where: { shipmentId: oldShipment.id, entryType: "CARTON_FEE" } });
      expect(oldEntryAfter.length).toBe(1);
      expect(Number(oldEntryAfter[0].feePerCarton)).toBe(5); // untouched by the later rate change
      expect(Number(oldEntryAfter[0].amount)).toBe(20);

      // A genuinely new shipment charged after the change uses the new rate.
      const newShipment = await createShipment({
        companyId: tenant.company.id,
        customerId: tenant.customerId,
        receiverName: "مستلم جديد",
        receiverPhone: "+967700000002",
        loadBranchId: tenant.branches[0].id,
        unloadBranchId: tenant.branches[1].id,
        cartonCount: 4,
      });
      const newEntry = await prisma.billingLedgerEntry.findFirstOrThrow({ where: { shipmentId: newShipment.id, entryType: "CARTON_FEE" } });
      expect(Number(newEntry.feePerCarton)).toBe(9);
      expect(Number(newEntry.amount)).toBe(36);
    } finally {
      await prisma.platform.update({ where: { id: PLATFORM_ID }, data: { feePerCartonYER: original.feePerCartonYER } });
      await cleanupTenant(tenant.company.id);
    }
  });
});
