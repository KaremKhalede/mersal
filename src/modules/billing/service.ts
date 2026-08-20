import { Prisma } from "@prisma/client";
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

/**
 * Removes the carton fee for a shipment that was cancelled before it became real usage.
 *
 * The product rule, and the whole rule: the platform charges for cartons it actually moved. A
 * shipment cancelled at intake — the only stage cancelDraftShipment permits (DRAFT/REGISTERED, i.e.
 * before it has touched a trip, a customs case or a payment) — never became usage, so the office
 * mistyping "50 cartons" and cancelling should not cost it 250 YER. Before this, chargeCartonFee
 * fired at creation and nothing ever reversed it, and the `ADJUSTMENT` entry type the schema
 * declares had no write path or UI anywhere.
 *
 * Deliberately a DELETE of the un-invoiced row, not a compensating ADJUSTMENT entry. An
 * un-invoiced CARTON_FEE has never been shown to anyone, never appeared on a bill, and never
 * entered a reconciliation — removing it changes no figure either side has seen. A credit note is
 * the right instrument for money already billed, and building one is exactly the accounting system
 * this batch was told not to build.
 *
 * Which is why `invoiceId: null` is in the WHERE and not merely assumed: once a fee is on an issued
 * invoice, the company has been billed and the two sides have agreed a number. That row stays, and
 * the (rare) refund is a conversation, not a silent database delete. A shipment cancelled after
 * invoicing keeps its charge — flagged in the audit metadata below so it is visible rather than
 * silent.
 */
export async function reverseUnbilledCartonFee(shipmentId: string) {
  const { count } = await prisma.billingLedgerEntry.deleteMany({
    where: { shipmentId, entryType: "CARTON_FEE", invoiceId: null },
  });
  return { reversed: count > 0 };
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
  return prisma.$transaction((tx) => recordSettlementTx(tx, companyId, invoiceId, amount, note));
}

/**
 * Transaction-scoped settlement — validation, ledger row, and the invoice's PAID flip, all on the
 * caller's own `tx`. Extracted so confirmPaymentSubmission can put the *review decision* inside the
 * same transaction as the money it produces; recordSettlement above is the standalone wrapper that
 * keeps every existing call site behaving exactly as before.
 *
 * Every read here — the invoice's status included — now happens on `tx`, so the checks and the
 * write they guard see one consistent snapshot. The old version read the invoice on the base
 * client and only then opened a transaction to write, which is precisely the gap two concurrent
 * confirmations slipped through.
 */
async function recordSettlementTx(
  tx: Prisma.TransactionClient,
  companyId: string,
  invoiceId: string,
  amount: number,
  note?: string
) {
  if (!(amount > 0)) throw new Error("مبلغ التسوية يجب أن يكون أكبر من صفر");

  const invoice = await tx.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId } });
  if (invoice.status === "PAID") throw new Error("الفاتورة مسددة بالكامل بالفعل");
  if (invoice.status === "CANCELLED") throw new Error("لا يمكن تسوية فاتورة ملغاة");

  const entry = await tx.billingLedgerEntry.create({
    data: { companyId, invoiceId, cartonCount: 0, feePerCarton: 0, amount: -amount, entryType: "SETTLEMENT", note },
  });

  const settlements = await tx.billingLedgerEntry.findMany({ where: { invoiceId, entryType: "SETTLEMENT" }, select: { amount: true } });
  const totalSettled = settlements.reduce((s, e) => s + Math.abs(toMoney(e.amount)), 0);
  if (totalSettled >= toMoney(invoice.totalAmount)) {
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
  }

  return { ...entry, amount: toMoney(entry.amount) };
}

/** Per-shipment breakdown for one invoice — the CARTON_FEE rows that were connected to it at
 * generateInvoice time. Powers the "تفاصيل الكراتين حسب الشحنات" panel on /app/billing. */
export async function listInvoiceCartonEntries(companyId: string, invoiceId: string) {
  const entries = await prisma.billingLedgerEntry.findMany({
    where: { companyId, invoiceId, entryType: "CARTON_FEE" },
    // select (not include: true) — the ledger table itself only needs id/number, and the
    // shipment row carries Decimal fields (amountPaid, etc.) that can't cross into the
    // "use client" ShipmentBreakdownTable as a prop.
    include: { shipment: { select: { id: true, shipmentNumber: true } } },
    orderBy: { createdAt: "desc" },
  });
  return entries.map((e) => ({ ...e, amount: toMoney(e.amount), feePerCarton: toMoney(e.feePerCarton) }));
}

export async function listInvoices(companyId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId },
    include: { entries: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });
  return invoices.map(({ entries, ...inv }) => {
    const totalAmount = toMoney(inv.totalAmount);
    const settlements = entries.filter((e) => e.entryType === "SETTLEMENT").map((e) => ({ ...e, amount: toMoney(e.amount) }));
    const settled = settlements.reduce((s, e) => s + Math.abs(e.amount), 0);
    const cartonCount = entries.filter((e) => e.entryType === "CARTON_FEE").reduce((s, e) => s + e.cartonCount, 0);
    return { ...inv, totalAmount, settlements, settled, cartonCount, remaining: Math.max(0, totalAmount - settled) };
  });
}

// ---------- Derived invoice state (shared by both dashboards) ----------

/**
 * The state an invoice is *shown* as. Deliberately derived, never stored: Invoice.status stays the
 * plain UNPAID|PAID|CANCELLED lifecycle, and everything a user actually reads is computed from the
 * two sources of truth — confirmed money (ledger settlements) and open claims (PaymentSubmission).
 *
 * Both dashboards call this one function, so the company and the platform can never disagree about
 * an invoice's badge the way they would if each page re-implemented the rules.
 *
 * Precedence is "what needs attention first": a pending claim outranks a partial balance, because
 * the next action is a review, not a payment.
 */
export type InvoiceState = "CANCELLED" | "PAID" | "AWAITING_REVIEW" | "REJECTED" | "PARTIAL" | "UNPAID";

export const INVOICE_STATE_LABELS: Record<InvoiceState, string> = {
  CANCELLED: "ملغاة",
  PAID: "مدفوعة",
  AWAITING_REVIEW: "بانتظار مراجعة الدفع",
  REJECTED: "مرفوض إثبات الدفع",
  PARTIAL: "مدفوعة جزئياً",
  UNPAID: "غير مدفوعة",
};

export const INVOICE_STATE_STYLES: Record<InvoiceState, string> = {
  CANCELLED: "bg-muted text-muted-foreground",
  PAID: "border-success/30 bg-success/15 text-success",
  AWAITING_REVIEW: "border-primary/30 bg-primary/10 text-primary",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  PARTIAL: "border-warning/30 bg-warning/15 text-warning",
  UNPAID: "bg-muted text-foreground",
};

export function deriveInvoiceState(params: {
  status: string;
  totalAmount: number;
  settled: number;
  hasPending: boolean;
  lastRejected: boolean;
}): InvoiceState {
  if (params.status === "CANCELLED") return "CANCELLED";
  if (params.settled >= params.totalAmount) return "PAID";
  if (params.hasPending) return "AWAITING_REVIEW";
  if (params.lastRejected && params.settled === 0) return "REJECTED";
  if (params.settled > 0) return "PARTIAL";
  return "UNPAID";
}

/**
 * Every invoice for a company with its derived state and the open-claim context the UI needs.
 * One query set feeding both the company page and the platform's company detail.
 */
export async function listCompanyInvoiceStates(companyId: string) {
  const [invoices, submissions] = await Promise.all([
    listInvoices(companyId),
    prisma.paymentSubmission.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceId: true, amount: true, status: true, rejectionReason: true, createdAt: true },
    }),
  ]);

  return invoices.map((inv) => {
    const own = submissions.filter((s) => s.invoiceId === inv.id);
    const pending = own.filter((s) => s.status === "PENDING");
    const newest = own[0];
    return {
      ...inv,
      state: deriveInvoiceState({
        status: inv.status,
        totalAmount: inv.totalAmount,
        settled: inv.settled,
        hasPending: pending.length > 0,
        lastRejected: newest?.status === "REJECTED",
      }),
      // Money claimed but not yet confirmed — must never be added to `settled`.
      pendingAmount: pending.reduce((sum, s) => sum + toMoney(s.amount), 0),
      lastRejection: newest?.status === "REJECTED" ? { id: newest.id, reason: newest.rejectionReason } : null,
    };
  });
}

/** Platform-wide total of money claimed but not yet reviewed. */
export async function pendingSubmissionTotal() {
  const agg = await prisma.paymentSubmission.aggregate({ _sum: { amount: true }, where: { status: "PENDING" } });
  return toMoney(agg._sum.amount);
}

// ---------- Payment submissions (company reports -> platform verifies) ----------

export type SubmissionStatus = "PENDING" | "CONFIRMED" | "REJECTED";

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: "بانتظار المراجعة",
  CONFIRMED: "مؤكدة",
  REJECTED: "مرفوضة",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: "تحويل بنكي",
  CASH: "نقداً",
  OTHER: "أخرى",
};

/**
 * Company-side: report a payment made toward an invoice. Creates nothing in the ledger — the money
 * is only a claim until the platform confirms it (see the PaymentSubmission model docstring).
 */
export async function submitPayment(params: {
  companyId: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string;
  note?: string;
  paidAt?: Date;
  proofKey?: string;
  proofFileName?: string;
  submittedById?: string;
}) {
  if (!(params.amount > 0)) throw new Error("مبلغ الدفعة يجب أن يكون أكبر من صفر");

  // findFirst scoped by companyId, not findUnique by id — a company must never be able to attach a
  // payment to another tenant's invoice by guessing its id.
  const invoice = await prisma.invoice.findFirst({ where: { id: params.invoiceId, companyId: params.companyId } });
  if (!invoice) throw new Error("الفاتورة غير موجودة");
  if (invoice.status === "CANCELLED") throw new Error("لا يمكن الإبلاغ عن دفعة لفاتورة ملغاة");

  const pending = await prisma.paymentSubmission.findFirst({
    where: { invoiceId: invoice.id, status: "PENDING" },
  });
  if (pending) throw new Error("توجد دفعة بانتظار المراجعة لهذه الفاتورة بالفعل");

  const created = await prisma.paymentSubmission.create({
    data: {
      companyId: params.companyId,
      invoiceId: invoice.id,
      amount: params.amount,
      method: params.method,
      reference: params.reference,
      note: params.note,
      paidAt: params.paidAt,
      proofKey: params.proofKey,
      proofFileName: params.proofFileName,
      submittedById: params.submittedById,
    },
  });
  return { ...created, amount: toMoney(created.amount) };
}

/**
 * Platform-side: accept a reported payment. This is the only path that turns a claim into money —
 * it appends the real SETTLEMENT ledger row through the existing recordSettlement(), so invoice
 * PAID/partial state keeps being derived exactly as before. Wrapped in a transaction with the
 * status flip so a submission can never be marked confirmed without its ledger row.
 */
export async function confirmPaymentSubmission(submissionId: string, reviewedById?: string) {
  return prisma.$transaction(async (tx) => {
    // Guarded claim FIRST, before a single ledger row exists.
    //
    // The previous shape was read-then-write across two separate transactions: read the submission,
    // see PENDING, call recordSettlement() (its own transaction), and only then flip the status.
    // Two reviewers — or one double-click on the review queue — both read PENDING and both appended
    // a SETTLEMENT row, crediting the invoice twice for one payment and potentially flipping it to
    // PAID on half the money. `ledgerEntryId @unique` did not catch it: two confirmations produce
    // two *different* entries with two different ids.
    //
    // This updateMany carries `status: "PENDING"` in its WHERE, so under READ COMMITTED the second
    // transaction blocks on the row lock, re-evaluates the predicate once the first commits, and
    // matches zero rows — refused before it reaches any money. And because the claim, the ledger
    // row and the invoice's PAID flip now share one transaction, they commit as a unit: there is no
    // window in which a CONFIRMED submission has no ledger row, or a ledger row no confirmation.
    const claim = await tx.paymentSubmission.updateMany({
      where: { id: submissionId, status: "PENDING" },
      data: { status: "CONFIRMED", reviewedById, reviewedAt: new Date() },
    });
    if (claim.count === 0) throw new Error("تمت مراجعة هذه الدفعة مسبقاً");

    const submission = await tx.paymentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    const entry = await recordSettlementTx(
      tx,
      submission.companyId,
      submission.invoiceId,
      toMoney(submission.amount),
      submission.note ?? submission.reference ?? undefined
    );

    return tx.paymentSubmission.update({ where: { id: submissionId }, data: { ledgerEntryId: entry.id } });
  });
}

/** Platform-side: reject a reported payment. Never touches the ledger. */
export async function rejectPaymentSubmission(submissionId: string, reason: string, reviewedById?: string) {
  if (!reason.trim()) throw new Error("سبب الرفض مطلوب");

  // Same guarded claim as confirmPaymentSubmission — a rejection races a confirmation just as
  // easily as it races another rejection, and the loser must be refused, never overwrite the winner.
  const claim = await prisma.paymentSubmission.updateMany({
    where: { id: submissionId, status: "PENDING" },
    data: { status: "REJECTED", rejectionReason: reason.trim(), reviewedById, reviewedAt: new Date() },
  });
  if (claim.count === 0) throw new Error("تمت مراجعة هذه الدفعة مسبقاً");

  return prisma.paymentSubmission.findUniqueOrThrow({ where: { id: submissionId } });
}

/**
 * The platform's review queue — every pending claim, oldest first (longest waiting on top).
 * Each row carries the invoice's already-settled amount so the reviewer can compare what is being
 * claimed against what is actually still owed, without opening another page.
 */
export async function listPendingSubmissions() {
  const rows = await prisma.paymentSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: {
      company: { select: { id: true, name: true, slug: true, logoColor: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          totalAmount: true,
          entries: { where: { entryType: "SETTLEMENT" }, select: { amount: true } },
        },
      },
    },
  });

  return rows.map((r) => {
    const total = toMoney(r.invoice.totalAmount);
    const settled = r.invoice.entries.reduce((s, e) => s + Math.abs(toMoney(e.amount)), 0);
    return {
      ...r,
      amount: toMoney(r.amount),
      invoice: { id: r.invoice.id, invoiceNumber: r.invoice.invoiceNumber, totalAmount: total },
      invoiceRemaining: Math.max(0, total - settled),
    };
  });
}

export async function countPendingSubmissions() {
  return prisma.paymentSubmission.count({ where: { status: "PENDING" } });
}

/** Every submission for a company, newest first — powers both dashboards' payment history. */
export async function listCompanySubmissions(companyId: string) {
  const rows = await prisma.paymentSubmission.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    include: { invoice: { select: { invoiceNumber: true } } },
  });
  return rows.map((r) => ({ ...r, amount: toMoney(r.amount) }));
}

export async function getSubmission(submissionId: string) {
  const row = await prisma.paymentSubmission.findUnique({ where: { id: submissionId } });
  return row ? { ...row, amount: toMoney(row.amount) } : null;
}

// ---------- Platform billing (usage + collection), /platform/billing ----------

export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

/**
 * Money conventions come straight from the ledger and are the same in every query below:
 *   due       = SUM(amount) over non-SETTLEMENT rows (CARTON_FEE + ADJUSTMENT) — positive receivables
 *   collected = SUM(-amount) over SETTLEMENT rows — settlements are stored negative (recordSettlement)
 *   remaining = due - collected
 *
 * `due` is read from the ledger rather than recomputed as cartons x current fee: each row stored the
 * rate it was actually charged at (chargeCartonFee), so recomputing would retroactively rewrite
 * history the moment the platform fee changes. The current fee is surfaced separately as a badge.
 *
 * Both figures are scoped to the selected month, so a settlement recorded in August against a July
 * invoice counts as August collection — a cash view, not an aging report.
 */
function monthBounds(month: Date) {
  return {
    start: new Date(month.getFullYear(), month.getMonth(), 1),
    end: new Date(month.getFullYear(), month.getMonth() + 1, 1),
  };
}

export function paymentStatusOf(due: number, collected: number): PaymentStatus {
  if (collected <= 0) return "UNPAID";
  if (collected >= due) return "PAID";
  return "PARTIAL";
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PAID: "مدفوعة",
  PARTIAL: "مدفوعة جزئياً",
  UNPAID: "غير مدفوعة",
};

/** Period totals for the KPI cards, aggregated in the database (one row back, not the month's rows). */
export async function platformBillingTotals(month: Date) {
  const { start, end } = monthBounds(month);
  const prev = monthBounds(new Date(month.getFullYear(), month.getMonth() - 1, 1));

  const [current, previous, feePerCarton] = await Promise.all([
    prisma.$queryRaw<{ cartons: number; due: number; collected: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN "entryType" <> 'SETTLEMENT' THEN "cartonCount" END), 0)::int AS cartons,
        COALESCE(SUM(CASE WHEN "entryType" <> 'SETTLEMENT' THEN "amount" END), 0)::float8 AS due,
        COALESCE(SUM(CASE WHEN "entryType" =  'SETTLEMENT' THEN -"amount" END), 0)::float8 AS collected
      FROM "BillingLedgerEntry"
      WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
    `,
    prisma.$queryRaw<{ cartons: number }[]>`
      SELECT COALESCE(SUM(CASE WHEN "entryType" <> 'SETTLEMENT' THEN "cartonCount" END), 0)::int AS cartons
      FROM "BillingLedgerEntry"
      WHERE "createdAt" >= ${prev.start} AND "createdAt" < ${prev.end}
    `,
    getCurrentPlatformFee(),
  ]);

  const row = current[0] ?? { cartons: 0, due: 0, collected: 0 };
  const prevCartons = previous[0]?.cartons ?? 0;

  return {
    feePerCarton,
    cartons: row.cartons,
    due: row.due,
    collected: row.collected,
    remaining: row.due - row.collected,
    rate: row.due === 0 ? 0 : Math.round((row.collected / row.due) * 100),
    cartonsChange: prevCartons === 0 ? null : Math.round(((row.cartons - prevCartons) / prevCartons) * 100),
  };
}

/**
 * Per-company rows for the selected month. Grouping, the payment-status filter and pagination all
 * happen in Postgres — the page never loads every company to slice in Node. Status can't sit in a
 * plain WHERE because it's derived from two aggregates, so the grouped result is wrapped in a
 * subquery and filtered there.
 */
export async function platformBillingByCompany(params: {
  month: Date;
  search?: string;
  status?: PaymentStatus;
  page?: number;
  pageSize?: number;
}) {
  const { start, end } = monthBounds(params.month);
  const pageSize = Math.min(Math.max(params.pageSize ?? 10, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const like = params.search?.trim() ? `%${params.search.trim()}%` : null;

  const statusFilter = Prisma.sql`
    AND (${params.status ?? null}::text IS NULL
      OR (${params.status ?? null}::text = 'PAID'    AND t.collected >= t.due AND t.due > 0)
      OR (${params.status ?? null}::text = 'PARTIAL' AND t.collected > 0 AND t.collected < t.due)
      OR (${params.status ?? null}::text = 'UNPAID'  AND t.collected <= 0))
  `;

  const grouped = Prisma.sql`
    SELECT c.id, c.name, c.slug, c."logoColor",
      COALESCE(SUM(CASE WHEN e."entryType" <> 'SETTLEMENT' THEN e."cartonCount" END), 0)::int AS cartons,
      COALESCE(SUM(CASE WHEN e."entryType" <> 'SETTLEMENT' THEN e."amount" END), 0)::float8 AS due,
      COALESCE(SUM(CASE WHEN e."entryType" =  'SETTLEMENT' THEN -e."amount" END), 0)::float8 AS collected
    FROM "Company" c
    JOIN "BillingLedgerEntry" e
      ON e."companyId" = c.id AND e."createdAt" >= ${start} AND e."createdAt" < ${end}
    WHERE (${like}::text IS NULL OR c."name" ILIKE ${like} OR c."slug" ILIKE ${like})
    GROUP BY c.id, c.name, c.slug, c."logoColor"
  `;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<
      { id: string; name: string; slug: string; logoColor: string; cartons: number; due: number; collected: number }[]
    >`
      SELECT * FROM (${grouped}) t
      WHERE TRUE ${statusFilter}
      ORDER BY t.due DESC, t.name ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (${grouped}) t WHERE TRUE ${statusFilter}
    `,
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  return {
    items: rows.map((r) => ({
      ...r,
      remaining: r.due - r.collected,
      rate: r.due === 0 ? 0 : Math.round((r.collected / r.due) * 100),
      status: paymentStatusOf(r.due, r.collected),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * One company's billing for the selected month: the same aggregates as its table row, plus the
 * settlement rows behind "collected" and any invoices covering the period. Payment method is not
 * modelled anywhere in the schema — only the free-text `note` is available as a reference.
 */
export async function platformBillingCompanyDetail(companyId: string, month: Date) {
  const { start, end } = monthBounds(month);

  const [company, agg, payments, invoices] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, slug: true, logoColor: true } }),
    prisma.$queryRaw<{ cartons: number; due: number; collected: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN "entryType" <> 'SETTLEMENT' THEN "cartonCount" END), 0)::int AS cartons,
        COALESCE(SUM(CASE WHEN "entryType" <> 'SETTLEMENT' THEN "amount" END), 0)::float8 AS due,
        COALESCE(SUM(CASE WHEN "entryType" =  'SETTLEMENT' THEN -"amount" END), 0)::float8 AS collected
      FROM "BillingLedgerEntry"
      WHERE "companyId" = ${companyId} AND "createdAt" >= ${start} AND "createdAt" < ${end}
    `,
    prisma.billingLedgerEntry.findMany({
      where: { companyId, entryType: "SETTLEMENT", createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, amount: true, note: true, invoiceId: true },
    }),
    prisma.invoice.findMany({
      where: { companyId, periodStart: { lt: end }, periodEnd: { gte: start } },
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true, status: true, totalAmount: true, periodStart: true, periodEnd: true },
    }),
  ]);

  if (!company) return null;
  const row = agg[0] ?? { cartons: 0, due: 0, collected: 0 };

  return {
    company,
    cartons: row.cartons,
    due: row.due,
    collected: row.collected,
    remaining: row.due - row.collected,
    rate: row.due === 0 ? 0 : Math.round((row.collected / row.due) * 100),
    status: paymentStatusOf(row.due, row.collected),
    payments: payments.map((p) => ({ ...p, amount: Math.abs(toMoney(p.amount)) })),
    invoices: invoices.map((i) => ({ ...i, totalAmount: toMoney(i.totalAmount) })),
  };
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
      select: { amount: true, cartonCount: true },
    }),
  ]);

  const collectedToday = paidToday.reduce((sum, s) => sum + toMoney(s.amountPaid), 0);
  const outstanding = openBalances.reduce((sum, s) => sum + Math.max(0, toMoney(s.shippingPrice) - toMoney(s.amountPaid)), 0);
  const platformFeesMTD = feeEntries.reduce((sum, e) => sum + toMoney(e.amount), 0);
  const cartonsMTD = feeEntries.reduce((sum, e) => sum + e.cartonCount, 0);

  return { collectedToday, outstanding, platformFeesMTD, cartonsMTD };
}
