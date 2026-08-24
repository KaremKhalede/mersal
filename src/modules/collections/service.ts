/**
 * ============================================================================================
 * CUSTOMER MONEY — and nothing else.
 * ============================================================================================
 *
 * This module answers the five questions a shipping-office manager opens the app for:
 *
 *   1. من عليه؟          -> customerReceivables().customers
 *   2. منذ متى؟           -> customerReceivables().aging  (and `oldestDays` per customer)
 *   3. كم تم تحصيله؟      -> collectedOnDay()
 *   4. من قبض اليوم؟      -> dailyClose().byEmployee
 *   5. هل يطابق الصندوق؟  -> dailyClose().cashExpected
 *
 * ## Why this is a separate module and not more functions in modules/billing/service.ts
 *
 * Chargee has two kinds of money that must never blend into one figure:
 *
 *   PLATFORM money — what the shipping company owes Chargee. BillingLedgerEntry -> Invoice
 *                    <- PaymentSubmission. Immutable ledger, reviewed settlements.
 *   CUSTOMER money — what a shipping customer owes the shipping company. Lives on the Shipment
 *                    row itself: shippingPrice / amountPaid / paymentDate / paymentReceivedById.
 *
 * modules/billing/service.ts owns the first. This file owns the second, and it deliberately
 * imports nothing from the billing module and touches no billing table: not BillingLedgerEntry,
 * not Invoice, not PaymentSubmission. The separation the product depends on is therefore visible
 * in the import graph, not just in a comment — a future function that tried to sum both would have
 * to reach across a module boundary to do it.
 *
 * Everything here is READ-ONLY. Payments are still recorded by exactly one function,
 * `recordPayment` in modules/shipments/service.ts, through exactly one dialog. This module never
 * writes.
 *
 * ============================================================================================
 * HOW "WHO COLLECTED WHAT TODAY" IS DERIVED WITHOUT A PAYMENTS TABLE
 * ============================================================================================
 *
 * `Shipment.amountPaid` is a RUNNING TOTAL, and `paymentDate`/`paymentReceivedById` describe only
 * the MOST RECENT payment. So a shipment paid 500 on Monday and 300 on Tuesday reads, on Tuesday,
 * as "800, taken by whoever took Tuesday's money". Summing amountPaid over shipments whose
 * paymentDate is today therefore counts Monday's 500 again — it answers "how much has been paid in
 * total on shipments that were touched today", which is not a number anyone can match against a
 * cash drawer.
 *
 * A daily close built on that figure would overstate the till by every earlier instalment. For a
 * screen whose entire purpose is reconciliation, that is not an approximation — it is a wrong
 * number wearing the word "إجمالي".
 *
 * The individual payments are already recorded, immutably, in AuditLog: every payment writes a
 * RECORD_PAYMENT row carrying `metadata.amountPaid` (the cumulative total *after* that payment),
 * the acting `userId`, and `createdAt`. Walking a shipment's rows in order and differencing
 * consecutive cumulative totals reconstructs the individual payments exactly:
 *
 *     rows:    500        800        800-500 = 300
 *     deltas:  500        300
 *
 * So no `Payment` table is added. It is not that one would be wrong — a real payments table is
 * where this goes if instalments ever become the norm — it is that the data is already there,
 * already immutable, already written on every payment path, and a new table would mean a migration,
 * a backfill, a second write in `recordPayment` (which this program is explicitly not allowed to
 * change), and two places that could disagree about what was collected.
 *
 * `ponytail: deltas are reconstructed from AuditLog on read. Correct and cheap at a shipping
 * office's volume (tens of payments a day, and the walk only loads shipments touched on the day
 * being closed). If daily payment volume ever reaches the thousands, or instalment plans become a
 * product feature, promote this to a real Payment table with an explicit amount column — the
 * reader API below (PaymentEvent) is already the shape such a table would return.`
 *
 * ## Known limit, stated rather than hidden
 *
 * `recordPayment` has always written its audit row; `createShipment` did not until this program
 * added one. So a shipment registered BEFORE this change that took money at the counter has no
 * event for that intake portion, and the consequence is not a missing figure — it is an overstated
 * one. The first later payment's row carries the cumulative total, and differencing it against a
 * zero baseline credits that later day with the intake money as well.
 *
 * It is not recoverable after the fact: the intake amount is not stored anywhere separate from the
 * running total it was folded into, so a backfill would have to invent it. Inventing a payment
 * event with a guessed amount, a guessed timestamp and no employee would put a number on a cash
 * sheet that nobody can trace to anything — strictly worse than a documented gap.
 *
 * Affected rows are bounded and, in practice, empty: only a shipment created before this deploy,
 * with money taken at intake, that receives a further payment after it. Balances are untouched
 * either way — receivables read the Shipment row directly, never the event stream.
 */

import { prisma } from "@/lib/db";
import { toMoney } from "@/lib/money";
import { shipmentTouchesBranch } from "@/lib/branch-scope";
import { UNPAID_WHERE } from "@/modules/shipments/service";
import { businessLocalInputToDate, formatBusinessDate } from "@/lib/timezone";

// ---------------------------------------------------------------------------------------------
// Business-day boundaries
// ---------------------------------------------------------------------------------------------

/** Today as YYYY-MM-DD in business time (AST), which is what every date input and URL param uses. */
export function businessToday(): string {
  return formatBusinessDate(new Date());
}

/**
 * The UTC instants that bound one business day. A day closes at midnight in Riyadh/Sana'a, not at
 * midnight wherever the server happens to run — the same reasoning (and the same helper) the trip
 * planner already uses for staff-entered times. See src/lib/timezone.ts.
 */
export function businessDayRange(day: string): { start: Date; end: Date } {
  const start = businessLocalInputToDate(`${day}T00:00`) ?? new Date(0);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Whole calendar days between two instants, counted in business time — so a shipment registered
 *  this morning is 0 days old regardless of the hour, and one registered yesterday is exactly 1. */
function businessDaysBetween(from: Date, to: Date): number {
  const a = businessDayRange(formatBusinessDate(from)).start.getTime();
  const b = businessDayRange(formatBusinessDate(to)).start.getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------------------------
// Aging
// ---------------------------------------------------------------------------------------------

/**
 * How long a balance has been outstanding, counted from `Shipment.createdAt`.
 *
 * The anchor is intake, not delivery, and that is a deliberate business call rather than a
 * convenience: the price is agreed and the goods change hands at the counter, so the debt exists
 * from that moment. Anchoring to `deliveredAt` instead would leave every undelivered shipment
 * ageless — including the ones that have been sitting unpaid and unmoved the longest, which are
 * precisely the rows a manager is looking for. Mixing the two anchors ("delivered ? deliveredAt :
 * createdAt") would produce a column where two rows showing "20 يوم" mean different things.
 *
 * One anchor, stated on the screen, verifiable by anyone who opens the shipment.
 */
export const AGING_BUCKETS = [
  { key: "0-7", label: "0–7 أيام", min: 0, max: 7 },
  { key: "8-14", label: "8–14 يوم", min: 8, max: 14 },
  { key: "15-30", label: "15–30 يوم", min: 15, max: 30 },
  { key: "30+", label: "أكثر من 30 يوم", min: 31, max: Number.POSITIVE_INFINITY },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingKeyFor(days: number): AgingKey {
  return (AGING_BUCKETS.find((b) => days >= b.min && days <= b.max) ?? AGING_BUCKETS[AGING_BUCKETS.length - 1]).key;
}

/** The threshold the "متأخر" figure uses. One constant so the card, the badge and any future filter
 *  can never drift apart. Matches the 8–14 bucket's upper edge by design: "late" starts where the
 *  second bucket ends. */
export const OVERDUE_AFTER_DAYS = 14;

// ---------------------------------------------------------------------------------------------
// Receivables — "من عليه؟ ومنذ متى؟"
// ---------------------------------------------------------------------------------------------

export type ReceivableShipment = {
  id: string;
  shipmentNumber: string;
  status: string;
  route: string;
  totalCartons: number;
  price: number;
  paid: number;
  remaining: number;
  ageDays: number;
  agingKey: AgingKey;
  createdAt: Date;
};

export type ReceivableCustomer = {
  id: string;
  name: string;
  phone: string;
  outstanding: number;
  shipmentCount: number;
  /** Age of this customer's OLDEST unpaid shipment — the number that decides how worried to be. */
  oldestDays: number;
  oldestAt: Date;
  /** Handed over and still unpaid: the goods are gone, the money is not. Counted separately
   *  because it is a different kind of debt from one on cargo the company still holds. */
  deliveredUnpaid: number;
  shipments: ReceivableShipment[];
};

export type Receivables = {
  outstanding: number;
  overdue: number;
  aging: { key: AgingKey; label: string; amount: number; count: number }[];
  customers: ReceivableCustomer[];
  shipmentCount: number;
};

/**
 * Every open customer balance, grouped by the person who owes it.
 *
 * The row set is `UNPAID_WHERE` — imported from modules/shipments/service rather than re-typed, so
 * this screen, the dashboard's "المتبقي على العملاء" figure and the shipments list's `?unpaid=1`
 * filter are provably the same population. A number that opens a list which does not add up to it
 * is the specific failure this import exists to prevent.
 *
 * Grouping happens in the page process, not in SQL. The set is bounded by construction — open
 * balances for one company, further narrowed to one branch for a branch-scoped role — and it is
 * measured in tens to low hundreds. A `groupBy` would still need a second query for the shipment
 * lines behind each customer, so it would trade one small read for two. If this ever stops being
 * hundreds, this is the comment that says where to move it.
 */
export async function customerReceivables(
  companyId: string,
  opts: { branchScope?: string | null; branchId?: string | null; aging?: AgingKey | null } = {}
): Promise<Receivables> {
  // A branch-scoped role can never widen its view; a company-wide role may narrow to one branch.
  const effectiveBranch = opts.branchScope ?? opts.branchId ?? null;

  const rows = await prisma.shipment.findMany({
    where: {
      companyId,
      ...UNPAID_WHERE,
      ...(effectiveBranch ? shipmentTouchesBranch(effectiveBranch) : {}),
    },
    select: {
      id: true,
      shipmentNumber: true,
      status: true,
      totalCartons: true,
      shippingPrice: true,
      amountPaid: true,
      createdAt: true,
      customer: { select: { id: true, name: true, phone: true } },
      loadBranch: { select: { name: true } },
      unloadBranch: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const now = new Date();
  const all: (ReceivableShipment & { customer: { id: string; name: string; phone: string } })[] = rows.map((s) => {
    const price = toMoney(s.shippingPrice);
    const paid = toMoney(s.amountPaid);
    const ageDays = businessDaysBetween(s.createdAt, now);
    return {
      id: s.id,
      shipmentNumber: s.shipmentNumber,
      status: s.status,
      route: `${s.loadBranch.name} ← ${s.unloadBranch.name}`,
      totalCartons: s.totalCartons,
      price,
      paid,
      // Clamped for the same reason the shipment page clamps it: an overpayment is allowed through
      // both entry doors, and a negative "remaining" is not a debt.
      remaining: Math.max(0, price - paid),
      ageDays,
      agingKey: agingKeyFor(ageDays),
      createdAt: s.createdAt,
      customer: s.customer,
    };
  });

  // Aging is computed over the WHOLE population, before the aging filter narrows the list —
  // otherwise clicking a bucket would rewrite the very chart that was clicked, and the four figures
  // would stop summing to the outstanding total above them.
  const aging = AGING_BUCKETS.map((b) => {
    const inBucket = all.filter((s) => s.agingKey === b.key);
    return {
      key: b.key,
      label: b.label,
      amount: inBucket.reduce((sum, s) => sum + s.remaining, 0),
      count: inBucket.length,
    };
  });

  const outstanding = all.reduce((sum, s) => sum + s.remaining, 0);
  const overdue = all.filter((s) => s.ageDays > OVERDUE_AFTER_DAYS).reduce((sum, s) => sum + s.remaining, 0);

  const visible = opts.aging ? all.filter((s) => s.agingKey === opts.aging) : all;

  const byCustomer = new Map<string, ReceivableCustomer>();
  for (const s of visible) {
    let entry = byCustomer.get(s.customer.id);
    if (!entry) {
      entry = {
        id: s.customer.id,
        name: s.customer.name,
        phone: s.customer.phone,
        outstanding: 0,
        shipmentCount: 0,
        oldestDays: 0,
        oldestAt: s.createdAt,
        deliveredUnpaid: 0,
        shipments: [],
      };
      byCustomer.set(s.customer.id, entry);
    }
    entry.outstanding += s.remaining;
    entry.shipmentCount += 1;
    if (s.ageDays > entry.oldestDays) {
      entry.oldestDays = s.ageDays;
      entry.oldestAt = s.createdAt;
    }
    if (s.status === "DELIVERED") entry.deliveredUnpaid += 1;
    entry.shipments.push(s);
  }

  const customers = [...byCustomer.values()]
    .map((c) => ({ ...c, shipments: [...c.shipments].sort((a, b) => b.ageDays - a.ageDays) }))
    // Biggest debt first: the manager works this list from the top and stops when the day runs out.
    .sort((a, b) => b.outstanding - a.outstanding);

  return { outstanding, overdue, aging, customers, shipmentCount: visible.length };
}

// ---------------------------------------------------------------------------------------------
// Daily close — "من قبض اليوم؟ وهل يطابق الصندوق؟"
// ---------------------------------------------------------------------------------------------


export type PaymentEvent = {
  id: string;
  at: Date;
  /** This payment alone, not the shipment's running total. See the module header. */
  amount: number;
  method: string;
  userId: string | null;
  userName: string;
  /** The branch of the EMPLOYEE who took the money — i.e. whose drawer it landed in. */
  branchId: string | null;
  branchName: string | null;
  shipmentId: string;
  shipmentNumber: string;
  customerName: string;
  /** The branches the SHIPMENT touches (load / unload / current), for the shipment-population
   *  scoping the dashboard figure uses. See the two scoping rules documented below. */
  shipmentBranchIds: (string | null)[];
};

/**
 * Every individual payment taken on one business day, company-wide and unscoped.
 *
 * ---------------------------------------------------------------------------------------------
 * THE TWO BRANCH SCOPES, AND WHY THIS FUNCTION APPLIES NEITHER
 * ---------------------------------------------------------------------------------------------
 * A payment sits at the intersection of two different branch questions, and this function's two
 * callers are asking different ones:
 *
 *   `dailyClose` asks "what is in THIS COUNTER'S drawer" -> scope by the EMPLOYEE'S branch.
 *      The till belongs to the counter the employee was standing at, not to wherever the cargo
 *      happens to be routed. That is not a wider door than the rest of the app either:
 *      `recordPaymentAction` already gates payment on an EXACT match against the shipment's
 *      *current* branch (assertOwnsShipmentExact), so a branch employee can only ever have taken
 *      money on a shipment that was at their own branch.
 *
 *   `collectedOnDay` asks "how much came in against MY BRANCH'S SHIPMENTS" -> scope by
 *      shipment-touch, the same predicate `customerReceivables` and the shipments list use. It
 *      feeds the dashboard card sitting directly beside "المتبقي على العملاء", and two figures
 *      side by side must count the same population or they cannot be read against each other.
 *
 * Both are correct answers to their own question, and for a company-wide manager — the persona
 * this screen is built for — they are the same number. Rather than pick one and be wrong on one of
 * the two screens, this returns everything and each caller narrows it, in one documented line, to
 * the population its own label promises.
 */
async function paymentEvents(companyId: string, day: string): Promise<PaymentEvent[]> {
  const { start, end } = businessDayRange(day);

  // 1. Which shipments saw a payment on this day at all.
  const touched = await prisma.auditLog.findMany({
    where: {
      companyId,
      action: "RECORD_PAYMENT",
      entityType: "Shipment",
      createdAt: { gte: start, lt: end },
    },
    select: { entityId: true },
  });
  const shipmentIds = [...new Set(touched.map((t) => t.entityId).filter((id): id is string => Boolean(id)))];
  if (shipmentIds.length === 0) return [];

  // 2. Their FULL payment history — the earlier rows are what make today's deltas computable.
  const [history, shipments] = await Promise.all([
    prisma.auditLog.findMany({
      where: { companyId, action: "RECORD_PAYMENT", entityType: "Shipment", entityId: { in: shipmentIds } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        entityId: true,
        createdAt: true,
        metadata: true,
        userId: true,
        user: { select: { name: true, branchId: true, branch: { select: { name: true } } } },
      },
    }),
    prisma.shipment.findMany({
      where: { id: { in: shipmentIds }, companyId },
      select: {
        id: true,
        shipmentNumber: true,
        loadBranchId: true,
        unloadBranchId: true,
        currentBranchId: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const shipmentById = new Map(shipments.map((s) => [s.id, s]));

  // 3. Walk each shipment's cumulative totals into per-payment deltas, keeping only today's.
  const runningPaid = new Map<string, number>();
  const events: PaymentEvent[] = [];

  for (const row of history) {
    const shipmentId = row.entityId;
    if (!shipmentId) continue;
    const shipment = shipmentById.get(shipmentId);
    // A shipment that vanished (cascade-deleted tenant, cleaned-up fixture) leaves its audit rows
    // behind by design — AuditLog.entityId is not a foreign key. Skipping keeps the close honest
    // rather than printing a payment against a blank line.
    if (!shipment) continue;

    let cumulative: number | null = null;
    let method = "CASH";
    try {
      const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
      if (typeof meta.amountPaid === "number") cumulative = meta.amountPaid;
      if (typeof meta.paymentMethod === "string") method = meta.paymentMethod;
    } catch {
      cumulative = null;
    }
    // Unreadable metadata must not silently shift every later delta on the same shipment, so the
    // running total is left untouched and the row is dropped entirely.
    if (cumulative === null) continue;

    const previous = runningPaid.get(shipmentId) ?? 0;
    const delta = cumulative - previous;
    runningPaid.set(shipmentId, cumulative);

    if (row.createdAt < start || row.createdAt >= end) continue;
    // A zero delta is a re-save with no money attached — real in the UI, where the dialog pre-fills
    // the current total — and is not a payment. A negative delta IS kept: it is a correction of an
    // over-entered amount, and a till that is short by it needs to show why.
    if (delta === 0) continue;

    events.push({
      id: row.id,
      at: row.createdAt,
      amount: delta,
      method,
      userId: row.userId,
      userName: row.user?.name ?? "غير معروف",
      branchId: row.user?.branchId ?? null,
      branchName: row.user?.branch?.name ?? null,
      shipmentId,
      shipmentNumber: shipment.shipmentNumber,
      customerName: shipment.customer.name,
      shipmentBranchIds: [shipment.loadBranchId, shipment.unloadBranchId, shipment.currentBranchId],
    });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());
  return events;
}

export type CloseByEmployee = {
  userId: string | null;
  userName: string;
  branchName: string | null;
  count: number;
  total: number;
  cash: number;
  other: number;
};

export type DailyClose = {
  day: string;
  events: PaymentEvent[];
  byEmployee: CloseByEmployee[];
  byBranch: { branchName: string; total: number; cash: number; count: number }[];
  total: number;
  /** CASH only. This is the figure that must equal what is physically in the drawer — a bank
   *  transfer collected today is real money collected and belongs in `total`, but it is not in the
   *  till, and a close sheet that mixed the two could never be reconciled against anything. */
  cashExpected: number;
  other: number;
};

/**
 * The counter's cash close for one business day: who took money, how much, and what should be in
 * the drawer at the end of it.
 *
 * Scoped by the ACTING EMPLOYEE'S branch — see `paymentEvents` for why that, and not the
 * shipment's branch, is the right cut for a till sheet.
 */
export async function dailyClose(
  companyId: string,
  day: string,
  opts: { branchScope?: string | null; branchId?: string | null } = {}
): Promise<DailyClose> {
  const effectiveBranch = opts.branchScope ?? opts.branchId ?? null;
  const all = await paymentEvents(companyId, day);
  const visible = effectiveBranch ? all.filter((e) => e.branchId === effectiveBranch) : all;

  const byEmployeeMap = new Map<string, CloseByEmployee>();
  for (const e of visible) {
    const key = e.userId ?? "system";
    let row = byEmployeeMap.get(key);
    if (!row) {
      row = { userId: e.userId, userName: e.userName, branchName: e.branchName, count: 0, total: 0, cash: 0, other: 0 };
      byEmployeeMap.set(key, row);
    }
    row.count += 1;
    row.total += e.amount;
    if (e.method === "CASH") row.cash += e.amount;
    else row.other += e.amount;
  }

  const byBranchMap = new Map<string, { branchName: string; total: number; cash: number; count: number }>();
  for (const e of visible) {
    const name = e.branchName ?? "على مستوى الشركة";
    let row = byBranchMap.get(name);
    if (!row) {
      row = { branchName: name, total: 0, cash: 0, count: 0 };
      byBranchMap.set(name, row);
    }
    row.total += e.amount;
    row.count += 1;
    if (e.method === "CASH") row.cash += e.amount;
  }

  const total = visible.reduce((sum, e) => sum + e.amount, 0);
  const cashExpected = visible.filter((e) => e.method === "CASH").reduce((sum, e) => sum + e.amount, 0);

  return {
    day,
    events: visible,
    byEmployee: [...byEmployeeMap.values()].sort((a, b) => b.total - a.total),
    byBranch: [...byBranchMap.values()].sort((a, b) => b.total - a.total),
    total,
    cashExpected,
    other: total - cashExpected,
  };
}

/**
 * How much money actually came in on one business day — the honest version of "المُحصّل اليوم".
 *
 * Same derivation as `dailyClose`, exposed separately so the dashboard card and the billing screen
 * read one definition instead of two. Before this existed, the dashboard summed `amountPaid` over
 * shipments whose `paymentDate` fell today, which re-counted every earlier instalment on those
 * shipments — see the module header.
 *
 * Scoped by shipment-touch, matching the "المتبقي على العملاء" figure it sits beside.
 */
export async function collectedOnDay(
  companyId: string,
  day: string,
  opts: { branchScope?: string | null } = {}
): Promise<number> {
  const events = await paymentEvents(companyId, day);
  const scope = opts.branchScope ?? null;
  const visible = scope ? events.filter((e) => e.shipmentBranchIds.includes(scope)) : events;
  return visible.reduce((sum, e) => sum + e.amount, 0);
}
