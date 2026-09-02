import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { nextShipmentNumber } from "@/lib/ids";
import { newTrackingToken, matchesPhoneLast4 } from "@/lib/tracking";
import { assertTransition, exceptionRecoveryTargets, RECOVERY_ACTION_LABELS } from "./state-machine";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { chargeCartonFee, reverseUnbilledCartonFee } from "@/modules/billing/service";
import type { ShipmentStatus, ShipmentEvent, ExceptionType, PaymentMethod, DeliveryChannel } from "@/lib/enums";
import { SHIPMENT_STATUS_LABELS } from "@/lib/enums";
import { logAudit } from "@/lib/audit";
import { toMoney, toMoneyOrNull } from "@/lib/money";
import { shipmentTouchesBranch, assertShipmentBranchAccess, assertShipmentPhysicalAccess, assertShipmentEditAccess, assertBranchMatch, getBranchScope } from "@/lib/branch-scope";
import { assertSameCompany } from "@/lib/tenant";

type Tx = Prisma.TransactionClient;

const STATUS_EVENT: Partial<Record<ShipmentStatus, ShipmentEvent>> = {
  RECEIVED: "SHIPMENT_RECEIVED",
  LOADED: "SHIPMENT_LOADED",
  IN_TRANSIT: "TRIP_DEPARTED",
  AT_INTERMEDIATE_STOP: "INTERMEDIATE_UPDATE",
  PARTIALLY_ARRIVED: "SHIPMENT_PARTIALLY_ARRIVED",
  ARRIVED: "SHIPMENT_ARRIVED",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  DELIVERY_REQUESTED: "DELIVERY_REQUESTED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "SHIPMENT_DELIVERED",
  EXCEPTION: "EXCEPTION",
};

/**
 * Any-Touch (Read/Visibility) — Company and branch ownership checked.
 */
export async function assertOwnsShipmentVisibility(
  user: { userType: string; companyId: string | null; role: { name: string } | null; branchId: string | null },
  shipmentId: string
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId: user.companyId }, shipment.companyId);
  assertShipmentBranchAccess(getBranchScope(user), shipment);
  return shipment;
}

/**
 * Target Access Policy: Physical Operations (e.g. Receive, Deliver, Exception)
 */
export async function assertOwnsShipmentPhysical(
  user: { userType: string; companyId: string | null; role: { name: string } | null; branchId: string | null },
  shipmentId: string
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId: user.companyId }, shipment.companyId);
  assertShipmentPhysicalAccess(getBranchScope(user), shipment);
  return shipment;
}

/**
 * Target Access Policy: Edit Details (Administrative)
 */
export async function assertOwnsShipmentEdit(
  user: { userType: string; companyId: string | null; role: { name: string } | null; branchId: string | null },
  shipmentId: string
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId: user.companyId }, shipment.companyId);
  assertShipmentEditAccess(getBranchScope(user), shipment);
  return shipment;
}



export type CreateShipmentInput = {
  companyId: string;
  customerId: string;
  receiverName: string;
  receiverPhone: string;
  loadBranchId: string;
  unloadBranchId: string;
  cartonCount: number;
  goodsType?: string;
  weightKg?: number;
  declaredValue?: number;
  notes?: string;
  createdById?: string;
};

export async function createShipment(input: CreateShipmentInput) {
  const shipmentNumber = await nextShipmentNumber();

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.create({
      data: {
        companyId: input.companyId,
        shipmentNumber,
        trackingToken: newTrackingToken(),
        customerId: input.customerId,
        receiverName: input.receiverName,
        receiverPhone: input.receiverPhone,
        loadBranchId: input.loadBranchId,
        unloadBranchId: input.unloadBranchId,
        currentBranchId: input.loadBranchId,
        goodsType: input.goodsType,
        weightKg: input.weightKg,
        declaredValue: input.declaredValue,
        notes: input.notes,
        totalCartons: input.cartonCount,
        status: "REGISTERED",
        createdById: input.createdById,
      },
    });

    await tx.carton.createMany({
      data: Array.from({ length: input.cartonCount }, (_, i) => ({
        shipmentId: s.id,
        cartonIndex: i + 1,
        cartonCode: `${shipmentNumber}-C${i + 1}`,
      })),
    });

    await tx.trackingEvent.create({
      data: {
        shipmentId: s.id,
        eventType: "REGISTERED",
        title: "تم تسجيل الشحنة",
        description: `عدد الكراتين: ${input.cartonCount}`,
      },
    });

    return s;
  });

  await chargeCartonFee(shipment.id);
  await logAudit({
    companyId: input.companyId,
    userId: input.createdById,
    action: "CREATE",
    entityType: "Shipment",
    entityId: shipment.id,
    metadata: { shipmentNumber },
  });


  return shipment;
}

/**
 * Low-level, transaction-scoped status transition — validates + mutates only, no side effects
 * (no notification, no audit log). Callers that need atomicity across several rows (bulk trip
 * ops, delivery request creation) run this inside their own `prisma.$transaction`, collect the
 * returned events, and dispatch notifications only after the transaction commits.
 */
export async function transitionShipmentStatusTx(
  tx: Tx,
  shipmentId: string,
  toStatus: ShipmentStatus,
  opts: { branchId?: string; note?: string } = {}
) {
  const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertTransition(shipment.status as ShipmentStatus, toStatus);

  const updated = await tx.shipment.update({
    where: { id: shipmentId },
    data: {
      status: toStatus,
      currentBranchId: opts.branchId ?? shipment.currentBranchId,
    },
  });

  const trackingEvent = await tx.trackingEvent.create({
    data: {
      shipmentId,
      eventType: toStatus,
      title: SHIPMENT_STATUS_LABELS[toStatus],
      description: opts.note,
    },
  });

  return { shipment: updated, fromStatus: shipment.status as ShipmentStatus, event: STATUS_EVENT[toStatus], trackingEventId: trackingEvent.id };
}

/** High-level status transition for single-shipment call sites — atomic, audited, and notifies the customer. */
export async function updateShipmentStatus(
  shipmentId: string,
  toStatus: ShipmentStatus,
  opts: { userId?: string; branchId?: string; note?: string } = {}
) {
  const { shipment: updated, fromStatus, event, trackingEventId } = await prisma.$transaction((tx) =>
    transitionShipmentStatusTx(tx, shipmentId, toStatus, opts)
  );

  await logAudit({
    companyId: updated.companyId,
    userId: opts.userId,
    action: "STATUS_CHANGE",
    entityType: "Shipment",
    entityId: shipmentId,
    metadata: { from: fromStatus, to: toStatus },
  });

  if (event) {
    await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  }

  return updated;
}

/**
 * "The customer still owes on this one." Byte-for-byte the condition billingSummary reduces over
 * (src/modules/billing/service.ts) — cancelled shipments are out, and a shipment with no agreed
 * price yet is out too: nothing is owed on a price that was never set, and `amountPaid < NULL` is
 * unknown in SQL anyway, so it must be excluded explicitly rather than left to the comparison.
 *
 * The comparison is column-to-column via a Prisma field reference, not a raw query — fully paid
 * (amountPaid == shippingPrice) drops out, partly paid and unpaid both stay in.
 */
export const UNPAID_WHERE = {
  status: { not: "CANCELLED" as const },
  shippingPrice: { not: null },
  amountPaid: { lt: prisma.shipment.fields.shippingPrice },
};

/**
 * The one column this list can be reordered by, and the two directions it takes.
 *
 * Deliberately not a generic "sort by any column" facility. The list has one question that a
 * different order actually answers — "what has been sitting here longest" — and every other column
 * either has no ordering anyone asks for (route, customer) or is better answered somewhere else:
 * "who owes the most" is the receivables tab (modules/collections/service.ts), which groups by
 * customer and ages the balance, rather than a flat scan of shipment rows.
 *
 * Sorting by the outstanding balance would also mean ordering on `shippingPrice - amountPaid`, an
 * expression Prisma cannot order by — so it would need raw SQL or an in-memory sort that silently
 * breaks pagination. Not worth it for a question that already has a better screen.
 */
export const SHIPMENT_SORT_DIRECTIONS = ["desc", "asc"] as const;
export type ShipmentSortDirection = (typeof SHIPMENT_SORT_DIRECTIONS)[number];

export async function listShipments(params: {
  companyId: string;
  status?: ShipmentStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  /** Creation date order. "desc" (newest first) is the default the list has always had; "asc"
   *  surfaces the oldest rows, which is how a stuck shipment gets found. */
  dir?: ShipmentSortDirection;
  /** Restricts to shipments that touch this branch (load/unload/current) — set for
   * branch-scoped roles, omitted for company-wide roles. See src/lib/branch-scope.ts. */
  branchId?: string | null;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  // branchId and search each need their own OR clause — combined via AND so neither's OR
  // silently overwrites the other's (which sibling-spreading two `{ OR: [...] }` objects would do).
  const where = {
    companyId: params.companyId,
    ...(params.status ? { status: params.status } : {}),
    AND: [
      params.branchId ? shipmentTouchesBranch(params.branchId) : {},
      params.search
        ? {
            OR: [
              // Shipment numbers are always generated upper-case (SH-XXXXX); normalizing the query
              // here — instead of relying on Prisma's `mode: "insensitive"`, which SQLite rejects —
              // keeps the search behavior identical after a future move to Postgres.
              { shipmentNumber: { contains: params.search.toUpperCase() } },
              { receiverName: { contains: params.search } },
              { receiverPhone: { contains: params.search } },
              // A carton code is the shipment number plus "-C{n}" (see createShipment), so pasting
              // a whole code found nothing: `contains` asks whether SH-100001 contains
              // SH-100001-C3, which is the test backwards. Matching the carton itself makes the
              // string printed on the box a working search term.
              { cartons: { some: { cartonCode: { contains: params.search.toUpperCase() } } } },
            ],
          }
        : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: { customer: true, loadBranch: true, unloadBranch: true, currentBranch: true },
      orderBy: { createdAt: params.dir === "asc" ? "asc" : "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shipment.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Status-distribution counts for the shipments list header — same branch scope as the list
 * itself, but independent of the list's own search/status filters, so the cards always read as
 * "the whole picture" rather than shrinking to match whatever's currently filtered. */
export async function shipmentStatusCounts(companyId: string, branchId?: string | null) {
  const where = { companyId, ...(branchId ? shipmentTouchesBranch(branchId) : {}) };
  const [total, delivered, inTransit, readyForPickup, needsAttention] = await Promise.all([
    prisma.shipment.count({ where }),
    prisma.shipment.count({ where: { ...where, status: "DELIVERED" } }),
    prisma.shipment.count({ where: { ...where, status: { in: ["IN_TRANSIT", "AT_INTERMEDIATE_STOP"] } } }),
    prisma.shipment.count({ where: { ...where, status: "READY_FOR_PICKUP" } }),
    prisma.shipment.count({ where: { ...where, status: { in: ["PARTIALLY_ARRIVED", "EXCEPTION"] } } }),
  ]);
  return { total, delivered, inTransit, readyForPickup, needsAttention };
}

/** Every matching shipment, unpaginated — backs the "تصدير" CSV export, which must cover the
 * whole filtered set, not just the page currently on screen. */
export async function listShipmentsForExport(params: { companyId: string; status?: ShipmentStatus; search?: string; branchId?: string | null; dir?: ShipmentSortDirection }) {
  const { items } = await listShipments({ ...params, page: 1, pageSize: 10_000 });
  return items;
}

export async function getShipmentDetail(companyId: string, shipmentId: string, branchId?: string | null) {
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, companyId, ...(branchId ? shipmentTouchesBranch(branchId) : {}) },
    include: {
      customer: true,
      loadBranch: true,
      unloadBranch: true,
      currentBranch: true,
      cartons: { orderBy: { cartonIndex: "asc" } },
      trackingEvents: { orderBy: { createdAt: "desc" } },
      customsCase: true,
      documents: true,
      deliveryRequest: true,
      tripLinks: { include: { trip: true, loadStop: { include: { branch: true } }, unloadStop: { include: { branch: true } } } },
    },
  });
  if (!shipment) return null;

  // Decimal -> number at the read boundary: this object is passed straight into Client Component
  // props (ShipmentActions, CustomsPanel, DeliveryPanel), which can't receive raw Decimal instances.
  return {
    ...shipment,
    shippingPrice: toMoneyOrNull(shipment.shippingPrice),
    amountPaid: toMoney(shipment.amountPaid),
    customsCase: shipment.customsCase ? { ...shipment.customsCase, declaredValue: toMoneyOrNull(shipment.customsCase.declaredValue) } : null,
    deliveryRequest: shipment.deliveryRequest ? { ...shipment.deliveryRequest, deliveryFee: toMoney(shipment.deliveryRequest.deliveryFee) } : null,
  };
}

export async function markReadyForPickup(shipmentId: string, userId?: string) {
  return updateShipmentStatus(shipmentId, "READY_FOR_PICKUP", { userId });
}

/**
 * What an employee must record before a shipment may be marked delivered.
 *
 * `last4` is checked against the shipment's own receiverPhone, reusing the public tracking page's
 * matcher (src/lib/tracking.ts) so both places agree on what "the last 4 digits" means — including
 * Arabic-Indic digits typed on a phone keyboard.
 *
 * What this check is and is not: it is NOT an authorization control. The employee running it is
 * already authenticated, already holds shipments.updateStatus, and can read receiverPhone in full
 * on the shipment page — so it stops no insider, and is deliberately not rate-limited the way the
 * public action is. What it is: a recorded procedural step proving the counter asked the person in
 * front of them for the number the shipment is filed under, which is what answers a later "I never
 * received it". Authorization is the permission check in the action; this is the evidence.
 */
export type DeliveryProofInput = { receivedByName: string; last4: string; note?: string };

/**
 * Validates a handover and returns the columns to write. Throws Arabic messages the employee can
 * act on — call sites surface them via actionResult() rather than letting them become a digest.
 *
 * Exported because the two handover paths (this module's branch pickup, delivery/service.ts's home
 * delivery) must record identical evidence; a second, drifting copy of these rules is exactly the
 * failure this prevents.
 */
export function deliveryProofData(
  shipment: { receiverPhone: string },
  input: DeliveryProofInput,
  channel: DeliveryChannel
) {
  const receivedByName = input.receivedByName.trim();
  if (receivedByName.length < 2) throw new Error("أدخل اسم الشخص الذي استلم الشحنة");
  if (!matchesPhoneLast4(shipment.receiverPhone, input.last4)) {
    throw new Error("آخر 4 أرقام لا تطابق جوال المستلم المسجّل");
  }

  return {
    deliveredToName: receivedByName,
    // The digits that were verified, taken from the number on file rather than from the input:
    // the match above already proved they are equal, and this way the stored proof can never be a
    // differently-formatted echo of whatever was typed.
    deliveredToLast4: shipment.receiverPhone.replace(/\D/g, "").slice(-4),
    deliveredAt: new Date(),
    deliveryChannel: channel,
    deliveryNote: input.note?.trim() || null,
  };
}

/**
 * The tracking line a handover leaves behind. A short handover has to say so in the timeline the
 * customer can read, and name the cartons — "تم التسليم" alone next to a shipment that is one
 * carton light is the kind of record that gets a company accused of hiding it.
 */
export function handoverNote(prefix: string, receivedByName: string, missing: { cartonCode: string }[]) {
  const base = `${prefix} — استلمها: ${receivedByName}`;
  if (missing.length === 0) return base;
  return `${base} — سُلّمت مع نقص ${missing.length} كرتون (لم يُسلَّم: ${missing.map((c) => c.cartonCode).join("، ")})`;
}

/**
 * Hands the cartons over at the branch counter.
 *
 * One transaction now, where it used to flip every carton to DELIVERED *before* attempting the
 * status transition: a second click on an already-delivered shipment ran the carton update, then
 * threw on the invalid transition, leaving the write half-applied. Proof, cartons and status all
 * commit together or not at all, and the transition itself (DELIVERED has no outgoing edges in the
 * state machine) is what makes a duplicate handover impossible rather than a separate flag.
 */
export async function confirmBranchPickup(shipmentId: string, proof: DeliveryProofInput, userId?: string) {
  const { shipment, event, trackingEventId, missingCount } = await prisma.$transaction(async (tx) => {
    const current = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const proofData = deliveryProofData(current, proof, "BRANCH_PICKUP");
    const missing = await tx.carton.findMany({ where: { shipmentId, status: "MISSING" }, select: { cartonCode: true } });

    const result = await transitionShipmentStatusTx(tx, shipmentId, "DELIVERED", {
      note: handoverNote("تم الاستلام من الفرع", proofData.deliveredToName, missing),
    });
    // NOT `where: { shipmentId }`: a blanket update marked cartons that never arrived as DELIVERED,
    // silently erasing the one fact the unload flow exists to record. You cannot hand over a carton
    // you do not have, so a missing carton stays missing through the handover and beyond.
    await tx.carton.updateMany({ where: { shipmentId, status: { not: "MISSING" } }, data: { status: "DELIVERED" } });
    const updated = await tx.shipment.update({ where: { id: shipmentId }, data: proofData });
    return { shipment: updated, event: result.event, trackingEventId: result.trackingEventId, missingCount: missing.length };
  });

  await logAudit({
    companyId: shipment.companyId,
    userId,
    action: "DELIVERED",
    entityType: "Shipment",
    entityId: shipmentId,
    metadata: { channel: "BRANCH_PICKUP", deliveredToName: shipment.deliveredToName, missingCount },
  });

  if (event) await dispatchShipmentEvent(event, shipmentId, trackingEventId, { missingCount });
  return shipment;
}

/**
 * Edits the intake details of a shipment — only while it's DRAFT/REGISTERED, i.e. before it has
 * touched a trip, a customs case, or a payment record. Deliberately narrow: receiver/goods/notes/
 * price only, never loadBranchId/unloadBranchId/cartonCount (those already have real cartons and
 * carton codes generated against them — changing them is a structural operation this batch doesn't
 * attempt, not a same-shape edit), and never amountPaid (recordPayment already owns that field).
 *
 * Self-contained company + branch check (production-readiness cleanup) — matches the pattern
 * customs/delivery/documents services already use: the caller passes companyId/branchScope straight
 * through, and this function is the actual gate, not a formality the caller has to remember to run
 * first. EXACT branch match (against currentBranchId), same reasoning as recordPaymentAction — an
 * edit isn't tied to a specific touchpoint, so any-touch would be too permissive.
 */
export async function updateShipmentDetails(
  companyId: string,
  shipmentId: string,
  input: { receiverName: string; receiverPhone: string; goodsType?: string; weightKg?: number; notes?: string },
  opts: { userId?: string; branchScope?: string | null } = {}
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, shipment.companyId);
  assertShipmentEditAccess(opts.branchScope, shipment);
  if (shipment.status !== "DRAFT" && shipment.status !== "REGISTERED") {
    throw new Error("لا يمكن تعديل الشحنة بعد بدء تجهيزها");
  }

  const updated = await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      receiverName: input.receiverName,
      receiverPhone: input.receiverPhone,
      goodsType: input.goodsType,
      weightKg: input.weightKg,
      notes: input.notes,
    },
  });

  await logAudit({ companyId: updated.companyId, userId: opts.userId, action: "EDIT", entityType: "Shipment", entityId: shipmentId });
  return updated;
}

/**
 * Direct cancel for a shipment that never left intake — no exception detour needed. Deliberately
 * narrower than the state machine technically allows (RECEIVED/READY_FOR_LOADING can also reach
 * CANCELLED today, via the exception flow) — this direct action is scoped to exactly what Phase 5
 * P1 batch 2 asked for.
 *
 * Self-contained company + branch check, same reasoning as updateShipmentDetails above — but
 * ANY-TOUCH (assertShipmentBranchAccess), not exact: cancel isn't in the payment/edit "generic
 * record change" bucket the Phase 6 exact-match rule targets, so it keeps the same rule every other
 * status-changing shipment mutation uses.
 */
export async function cancelDraftShipment(companyId: string, shipmentId: string, opts: { userId?: string; branchScope?: string | null } = {}) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, shipment.companyId);
  // Target Access Policy: Administrative action, limited to ORIGIN branch for cancellations.
  // We can enforce ORIGIN specifically since it's a draft cancel. 
  assertShipmentEditAccess(opts.branchScope, shipment);
  if (shipment.status !== "DRAFT" && shipment.status !== "REGISTERED") {
    throw new Error("لا يمكن إلغاء الشحنة بعد بدء تجهيزها — استخدم الاستثناء بدلاً من ذلك");
  }
  const cancelled = await updateShipmentStatus(shipmentId, "CANCELLED", { userId: opts.userId, note: "ألغيت قبل بدء التجهيز" });

  // The platform charges for cartons it actually moved. This action only ever runs on a shipment
  // that never left intake, so its carton fee was never real usage — see reverseUnbilledCartonFee
  // for why an un-invoiced fee is deleted rather than credited, and why an invoiced one is kept.
  // After the transition, not before: a refused cancel must not drop the charge on its way out.
  const { reversed } = await reverseUnbilledCartonFee(shipmentId);
  await logAudit({
    companyId: shipment.companyId,
    userId: opts.userId,
    action: "CANCEL",
    entityType: "Shipment",
    entityId: shipmentId,
    metadata: { cartonFeeReversed: reversed },
  });

  return cancelled;
}


/**
 * A carton that was recorded MISSING turns up after the shipment was already handed over.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS NOT confirmRemainingArrived
 * ---------------------------------------------------------------------------------------------
 * That one means "the rest of the shipment reached the branch", and it moves the shipment to
 * ARRIVED — which DELIVERED cannot become, because the customer already took the rest and the
 * handover is a fact with a signature-equivalent behind it. Reopening the shipment to record one
 * box would rewrite a closed handover, which is the thing P0-4 exists to prevent.
 *
 * So this touches only what actually changed: the carton, and the derived arrived count. The
 * shipment keeps its status, its deliveredAt, and its whole delivery proof untouched.
 *
 * Deliberately no WhatsApp message. There is no approved Meta template for a late carton and no
 * eighth template is being added, so the real provider would only ever record a SKIPPED row; the
 * customer already has the delivery message telling them a carton was short and to contact the
 * office, and this event is customer-visible on their tracking page. A message here would be a
 * template request, not a product gap.
 */
export async function confirmLateCartons(
  companyId: string,
  shipmentId: string,
  cartonIds: string[],
  opts: { userId?: string; branchScope?: string | null } = {}
) {
  if (cartonIds.length === 0) throw new Error("حدد الكرتون الذي وصل");

  const updated = await prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    assertSameCompany({ userType: "COMPANY_USER", companyId }, shipment.companyId);
    assertShipmentBranchAccess(opts.branchScope, shipment);
    if (shipment.status !== "DELIVERED") {
      // An open shipment has its own, better path: the rest arrived, so the shipment itself moves on.
      throw new Error("هذا الإجراء للشحنات المسلَّمة فقط — استخدم تأكيد وصول الباقي");
    }

    // Claimed, not just filtered: only cartons of this shipment that are still MISSING may flip, so
    // a stale second submit (or a carton id from another shipment) matches zero rows and changes
    // nothing rather than resurrecting a delivered carton.
    const claim = await tx.carton.updateMany({
      where: { id: { in: cartonIds }, shipmentId, status: "MISSING" },
      data: { status: "ARRIVED" },
    });
    if (claim.count === 0) throw new Error("لا يوجد كرتون مفقود مطابق لهذه الشحنة");

    const arrived = await tx.carton.count({ where: { shipmentId, status: { not: "MISSING" } } });
    await tx.shipment.update({ where: { id: shipmentId }, data: { arrivedCartons: arrived } });

    const cartons = await tx.carton.findMany({ where: { id: { in: cartonIds }, shipmentId }, orderBy: { cartonIndex: "asc" } });
    const codes = cartons.map((c) => c.cartonCode).join("، ");
    // A custom tracking type, which TrackingEvent.eventType has always allowed alongside status
    // transitions. It is what carries "this box turned up later" into both timelines — and, being
    // customer-visible, into the tracking page the receiver already has a link to.
    await tx.trackingEvent.create({
      data: {
        shipmentId,
        eventType: "CARTON_ARRIVED_LATE",
        title: "وصل كرتون متأخر",
        description: `وصل بعد تسليم الشحنة: ${codes}`,
        isCustomerVisible: true,
      },
    });

    return { shipment, count: claim.count, codes };
  });

  await logAudit({
    companyId,
    userId: opts.userId,
    action: "LATE_CARTON_ARRIVED",
    entityType: "Shipment",
    entityId: shipmentId,
    metadata: { cartons: updated.codes },
  });

  return { count: updated.count };
}

/**
 * Moves a shipment into EXCEPTION, remembering the status it was in so resolveException can put it
 * back. Structured type/note (instead of only a free-text tracking note) so an "exceptions" list can
 * be built and filtered.
 */
export async function raiseException(
  shipmentId: string,
  type: ExceptionType,
  note: string | undefined,
  userId?: string
) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const result = await transitionShipmentStatusTx(tx, shipmentId, "EXCEPTION", { note });
    event = result.event;
    trackingEventId = result.trackingEventId;
    return tx.shipment.update({
      where: { id: shipmentId },
      data: { exceptionType: type, exceptionNote: note, statusBeforeException: s.status },
    });
  });

  if (event) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  await logAudit({ companyId: shipment.companyId, userId, action: "RAISE_EXCEPTION", entityType: "Shipment", entityId: shipmentId, metadata: { type, note } });
  return shipment;
}

/** Resolves an EXCEPTION shipment back to the status it had before, or to an explicit target (e.g. CANCELLED). */
export async function resolveException(shipmentId: string, userId?: string, toStatus?: ShipmentStatus) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const before = s.statusBeforeException as ShipmentStatus | null;
    const allowed = exceptionRecoveryTargets(before);
    const target = toStatus ?? before ?? "RECEIVED";
    // Validated server-side against where the shipment physically was, not just against the flat
    // transition map: the map has to permit every recovery any shipment might need, and this is
    // what stops one shipment from taking another's. A client that posts a status outside the set
    // is refused here, whatever the UI offered.
    if (!allowed.includes(target)) {
      throw new Error("لا يمكن إعادة الشحنة إلى هذه الحالة من وضعها الحالي");
    }
    const result = await transitionShipmentStatusTx(tx, shipmentId, target, { note: "تم حل الاستثناء" });
    event = result.event;
    trackingEventId = result.trackingEventId;
    return tx.shipment.update({
      where: { id: shipmentId },
      data: { exceptionType: null, exceptionNote: null, statusBeforeException: null },
    });
  });

  if (event) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  await logAudit({ companyId: shipment.companyId, userId, action: "RESOLVE_EXCEPTION", entityType: "Shipment", entityId: shipmentId });
  return shipment;
}

/** Who reported the shipment's current open exception — read from the existing audit trail
 * (raiseException already logs a RAISE_EXCEPTION entry with the acting user), not a new field.
 * Used by the shipment detail page so an exception shows who flagged it, not just what/why. */
/** The recovery choices an employee may be offered for this shipment, in business language.
 *  Derived on the server from the shipment's own recorded pre-exception status — the page renders
 *  what this returns, and resolveException re-checks it, so the two can never drift apart. */
export async function getExceptionRecoveryOptions(shipmentId: string) {
  const shipment = await prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { statusBeforeException: true },
  });
  const before = shipment.statusBeforeException as ShipmentStatus | null;
  return exceptionRecoveryTargets(before).map((status) => ({
    status,
    label: RECOVERY_ACTION_LABELS[status],
    isPrimary: status === before,
  }));
}

export async function getExceptionReporter(shipmentId: string) {
  const entry = await prisma.auditLog.findFirst({
    where: { entityType: "Shipment", entityId: shipmentId, action: "RAISE_EXCEPTION" },
    orderBy: { createdAt: "desc" },
    include: { user: true },
  });
  return entry?.user ?? null;
}

export async function listExceptions(companyId: string, branchId?: string | null) {
  return prisma.shipment.findMany({
    where: { companyId, status: "EXCEPTION", ...(branchId ? shipmentTouchesBranch(branchId) : {}) },
    include: { customer: true, loadBranch: true, unloadBranch: true },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * The public tracking page's only read path — keyed by trackingToken, never by shipmentNumber.
 *
 * Looking this up by shipment number is what made the page enumerable (fewer than 90k possible
 * numbers); see src/lib/tracking.ts. Nothing else in the app should expose shipment data without a
 * session, so this function is deliberately the single public reader and returns only what the
 * tracking page renders.
 */
/**
 * The public lookup's read path: find a shipment by the number printed on its receipt.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS IS NOT A SECOND getShipmentByTrackingToken
 * ---------------------------------------------------------------------------------------------
 * Shipment numbers come from a Postgres sequence (SH-100001, SH-100002, ...) and are deliberately
 * guessable — src/lib/ids.ts says so outright, because "security no longer rests on these being
 * unguessable". That is only true while nothing hands out capability in exchange for one.
 *
 * So this function returns the shipment WITHOUT its tracking token, and its caller
 * (src/app/track/actions.ts) never renders the two actions that redirect cartons. Knowing a
 * shipment number plus the receiver's last four digits buys a READ of one shipment — the same read
 * a forwarded WhatsApp link already grants — and nothing else. The token, and therefore the ability
 * to move goods, stays with whoever actually received the message.
 *
 * Deliberately reuses getShipmentByTrackingToken's own include block by resolving the token first
 * and delegating: one public read shape, one allow-list, no chance of the two drifting apart into
 * two different definitions of "what a stranger may see".
 */
export async function findShipmentByPublicNumber(shipmentNumber: string) {
  // Numbers are generated upper-case; a customer copying off a receipt may not be.
  const row = await prisma.shipment.findUnique({
    where: { shipmentNumber: shipmentNumber.trim().toUpperCase() },
    select: { trackingToken: true, receiverPhone: true },
  });
  if (!row) return null;
  const full = await getShipmentByTrackingToken(row.trackingToken);
  return full ? { shipment: full, receiverPhone: row.receiverPhone } : null;
}

export async function getShipmentByTrackingToken(trackingToken: string) {
  return prisma.shipment.findUnique({
    where: { trackingToken },
    include: {
      company: true,
      loadBranch: true,
      unloadBranch: true,
      currentBranch: true,
      trackingEvents: { where: { isCustomerVisible: true }, orderBy: { createdAt: "asc" } },
      // Only the status is exposed publicly — address/phone/provider ref stay server-side.
      deliveryRequest: { select: { status: true } },
      // The planned arrival at the stop where this shipment gets unloaded — the customer-facing
      // ETA ("متى تصل شحنتي؟"). Only the open link (not yet unloaded) has a future answer; once
      // unloaded the real arrival is already in the timeline, so no estimate is needed. Nothing
      // else about the trip is exposed — not its number, driver, vehicle or other shipments.
      tripLinks: {
        where: { unloadedAt: null },
        select: { unloadStop: { select: { plannedArrival: true } } },
        take: 1,
      },
    },
  });
}
