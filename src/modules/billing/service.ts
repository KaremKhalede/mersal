import { prisma } from "@/lib/db";
import { nextInvoiceNumber } from "@/lib/ids";
import { toMoney } from "@/lib/money";
import { PLATFORM_ID } from "@/lib/platform";
import { shipmentTouchesBranch } from "@/lib/branch-scope";

/** Current platform fee, read fresh from Platform.feePerCartonYER — the single source of truth
 * for what a *new* charge should use. Never cache this across a charge, and never use it to
 * re-derive an old ledger entry's amount — each BillingLedgerEntry stores its own `feePerCarton`
 * precisely so a later rate change can't retroactively alter what was actually charged. */
export async function getCurrentPlatformFee(): Promise<number> {
  const platform = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });
  return toMoney(platform.feePerCartonYER);
}

/** Append-only — one ledger line per shipment, created once when the shipment is registered.
 * Charges at whatever Platform.feePerCartonYER is *right now*; the rate is copied onto the ledger
 * row (feePerCarton), so a later platform-fee change never rewrites what this shipment was billed. */
export async function chargeCartonFee(shipmentId: string) {
  const existing = await prisma.billingLedgerEntry.findFirst({ where: { shipmentId, entryType: "CARTON_FEE" } });
  if (existing) return existing;

  const [shipment, feePerCarton] = await Promise.all([
    prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } }),
    getCurrentPlatformFee(),
  ]);
  return prisma.billingLedgerEntry.create({
    data: {
      companyId: shipment.companyId,
      shipmentId: shipment.id,
      cartonCount: shipment.totalCartons,
      feePerCarton,
      amount: shipment.totalCartons * feePerCarton,
      entryType: "CARTON_FEE",
    },
  });
}

export async function generateInvoice(companyId: string, periodStart: Date, periodEnd: Date) {
  const entries = await prisma.billingLedgerEntry.findMany({
    where: { companyId, invoiceId: null, createdAt: { gte: periodStart, lte: periodEnd } },
  });
  if (entries.length === 0) return null;

  const totalAmount = entries.reduce((sum, e) => sum + toMoney(e.amount), 0);
  const invoiceNumber = await nextInvoiceNumber();

  const invoice = await prisma.invoice.create({
    data: {
      companyId,
      invoiceNumber,
      periodStart,
      periodEnd,
      totalAmount,
      entries: { connect: entries.map((e) => ({ id: e.id })) },
    },
  });
  // Server Action results cross the Server->Client boundary too — must not carry a raw Decimal.
  return { ...invoice, totalAmount: toMoney(invoice.totalAmount) };
}

export async function listLedgerEntries(companyId: string) {
  const entries = await prisma.billingLedgerEntry.findMany({
    where: { companyId },
    include: { shipment: true },
    orderBy: { createdAt: "desc" },
  });
  // Decimal -> number at the read boundary: these rows go straight into JSX/Client Component props.
  return entries.map((e) => ({ ...e, amount: toMoney(e.amount), feePerCarton: toMoney(e.feePerCarton) }));
}

/**
 * Immutable payment-toward-an-invoice record — mirrors chargeCartonFee's append-only shape
 * exactly, reusing the ledger's own long-documented (and, until now, never actually created)
 * `entryType: "SETTLEMENT"`. Never mutates the invoice's `totalAmount` or any prior entry; a
 * settlement is always a brand-new row, negative-signed (a credit against what's owed), so
 * "how much was actually paid" is always reconstructible from the ledger itself, never just a
 * single overwritable snapshot field the way Shipment.amountPaid already works for customer money.
 * The invoice flips to PAID automatically once cumulative settlements cover totalAmount; a partial
 * settlement leaves it UNPAID with the remaining balance still computable from the same rows.
 */
export async function recordSettlement(companyId: string, invoiceId: string, amount: number, note?: string) {
  if (!(amount > 0)) throw new Error("مبلغ التسوية يجب أن يكون أكبر من صفر");

  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId } });
  if (invoice.status === "PAID") throw new Error("الفاتورة مسددة بالكامل بالفعل");
  if (invoice.status === "CANCELLED") throw new Error("لا يمكن تسوية فاتورة ملغاة");

  return prisma.$transaction(async (tx) => {
    const entry = await tx.billingLedgerEntry.create({
      data: { companyId, invoiceId, cartonCount: 0, feePerCarton: 0, amount: -amount, entryType: "SETTLEMENT", note },
    });

    const settlements = await tx.billingLedgerEntry.findMany({ where: { invoiceId, entryType: "SETTLEMENT" }, select: { amount: true } });
    const totalSettled = settlements.reduce((s, e) => s + Math.abs(toMoney(e.amount)), 0);
    if (totalSettled >= toMoney(invoice.totalAmount)) {
      await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
    }

    return { ...entry, amount: toMoney(entry.amount) };
  });
}

export async function listInvoices(companyId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId },
    include: { entries: { where: { entryType: "SETTLEMENT" }, orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  return invoices.map((inv) => {
    const totalAmount = toMoney(inv.totalAmount);
    const settlements = inv.entries.map((e) => ({ ...e, amount: toMoney(e.amount) }));
    const settled = settlements.reduce((s, e) => s + Math.abs(e.amount), 0);
    return { ...inv, totalAmount, settlements, settled, remaining: Math.max(0, totalAmount - settled) };
  });
}

/** Company-wide platform-fee totals — CARTON_FEE entries only. Deliberately excludes SETTLEMENT
 * rows: "total fees charged" and "what's been paid toward them" are two different questions (see
 * recordSettlement's docstring) and must never blend into one ambiguous sum. */
export async function billingSummary(companyId: string) {
  const entries = await prisma.billingLedgerEntry.findMany({ where: { companyId, entryType: "CARTON_FEE" } });
  const totalAmount = entries.reduce((s, e) => s + toMoney(e.amount), 0);
  const totalCartons = entries.reduce((s, e) => s + e.cartonCount, 0);
  return { totalAmount, totalCartons, entryCount: entries.length };
}

/**
 * Company Owner dashboard finance section — three numbers, deliberately not a ledger/accounting
 * view (that's what /app/billing is for). See Phase 5 P1 batch-1 report for the exact formulas.
 * `branchScope` follows the same convention as every other P0-scoped query (src/lib/branch-scope.ts):
 * null = company-wide, a branchId = restrict to shipments touching that branch.
 */
export async function financeSummary(companyId: string, branchScope?: string | null) {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const branchWhere = branchScope ? shipmentTouchesBranch(branchScope) : {};

  const [paidToday, openBalances, feeEntries] = await Promise.all([
    prisma.shipment.findMany({
      where: { companyId, paymentDate: { gte: todayStart }, ...branchWhere },
      select: { amountPaid: true },
    }),
    prisma.shipment.findMany({
      where: { companyId, status: { not: "CANCELLED" }, shippingPrice: { not: null }, ...branchWhere },
      select: { shippingPrice: true, amountPaid: true },
    }),
    prisma.billingLedgerEntry.findMany({
      where: {
        companyId,
        entryType: "CARTON_FEE",
        createdAt: { gte: monthStart },
        ...(branchScope ? { shipment: shipmentTouchesBranch(branchScope) } : {}),
      },
      select: { amount: true },
    }),
  ]);

  const collectedToday = paidToday.reduce((sum, s) => sum + toMoney(s.amountPaid), 0);
  const outstanding = openBalances.reduce((sum, s) => sum + Math.max(0, toMoney(s.shippingPrice) - toMoney(s.amountPaid)), 0);
  const platformFeesMTD = feeEntries.reduce((sum, e) => sum + toMoney(e.amount), 0);

  return { collectedToday, outstanding, platformFeesMTD };
}
