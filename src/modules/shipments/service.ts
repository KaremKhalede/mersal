import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { nextShipmentNumber } from "@/lib/ids";
import { assertTransition } from "./state-machine";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { chargeCartonFee } from "@/modules/billing/service";
import type { ShipmentStatus, ShipmentEvent, ExceptionType, PaymentMethod } from "@/lib/enums";
import { SHIPMENT_STATUS_LABELS } from "@/lib/enums";
import { logAudit } from "@/lib/audit";
import { toMoney, toMoneyOrNull } from "@/lib/money";
import { shipmentTouchesBranch, assertShipmentBranchAccess, assertBranchMatch, getBranchScope } from "@/lib/branch-scope";
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
 * Single choke point for every shipment mutation — company AND branch ownership both checked
 * here, so a Branch Employee who knows a shipment id outside their branch can't act on it via any
 * action that routes through this, even though they hold the RBAC permission. Lives in the plain
 * service module (not the "use server" actions file) specifically so it's directly callable from
 * tests without a request context — same pattern as dispatchShipmentEvent/chargeCartonFee.
 */
export async function assertOwnsShipment(
  user: { userType: string; companyId: string | null; role: { name: string } | null; branchId: string | null },
  shipmentId: string
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId: user.companyId }, shipment.companyId);
  assertShipmentBranchAccess(getBranchScope(user), shipment);
  return shipment;
}

/**
 * Stricter sibling of assertOwnsShipment — for the two mutations that aren't tied to *any* branch
 * the shipment has ever touched, but specifically to where it physically sits right now: recording
 * a payment and editing intake details. Phase 6 finding: assertOwnsShipment's "any touch" rule lets
 * a Branch Employee at the origin branch record a payment or edit a shipment that has already moved
 * on to its destination branch, purely because their branch touched it once. Every other mutation
 * (receive, mark ready, confirm pickup, cancel, raise/resolve exception, status updates in general)
 * keeps the any-touch rule on purpose — those actions are each inherently tied to whichever specific
 * touchpoint matches, so "any touch" is the correct rule for them, not a gap. Only payment and edit
 * are generic record changes with no inherent location, which is exactly what made the any-touch
 * rule too permissive for them specifically.
 */
export async function assertOwnsShipmentExact(
  user: { userType: string; companyId: string | null; role: { name: string } | null; branchId: string | null },
  shipmentId: string
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId: user.companyId }, shipment.companyId);
  assertBranchMatch(getBranchScope(user), shipment.currentBranchId);
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
  shippingPrice?: number;
  amountPaid?: number;
  paymentMethod?: PaymentMethod;
};

export async function createShipment(input: CreateShipmentInput) {
  const shipmentNumber = await nextShipmentNumber();

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.create({
      data: {
        companyId: input.companyId,
        shipmentNumber,
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
        shippingPrice: input.shippingPrice,
        amountPaid: input.amountPaid ?? 0,
        paymentMethod: input.paymentMethod,
        paymentDate: input.amountPaid ? new Date() : undefined,
        paymentReceivedById: input.amountPaid ? input.createdById : undefined,
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

export async function listShipments(params: {
  companyId: string;
  status?: ShipmentStatus;
  search?: string;
  page?: number;
  pageSize?: number;
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
            ],
          }
        : {},
    ],
  };

  const [items, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      include: { customer: true, loadBranch: true, unloadBranch: true, currentBranch: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.shipment.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
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

export async function confirmBranchPickup(shipmentId: string, userId?: string) {
  await prisma.carton.updateMany({ where: { shipmentId }, data: { status: "DELIVERED" } });
  return updateShipmentStatus(shipmentId, "DELIVERED", { userId, note: "تم الاستلام من الفرع" });
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
  input: { receiverName: string; receiverPhone: string; goodsType?: string; weightKg?: number; notes?: string; shippingPrice?: number },
  opts: { userId?: string; branchScope?: string | null } = {}
) {
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, shipment.companyId);
  assertBranchMatch(opts.branchScope, shipment.currentBranchId);
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
      shippingPrice: input.shippingPrice,
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
  assertShipmentBranchAccess(opts.branchScope, shipment);
  if (shipment.status !== "DRAFT" && shipment.status !== "REGISTERED") {
    throw new Error("لا يمكن إلغاء الشحنة بعد بدء تجهيزها — استخدم الاستثناء بدلاً من ذلك");
  }
  return updateShipmentStatus(shipmentId, "CANCELLED", { userId: opts.userId, note: "ألغيت قبل بدء التجهيز" });
}

/** Records/updates the customer's shipping payment — separate from the platform's per-carton ledger fee. */
export async function recordPayment(
  shipmentId: string,
  input: { amountPaid: number; paymentMethod: PaymentMethod; userId?: string }
) {
  const shipment = await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      amountPaid: input.amountPaid,
      paymentMethod: input.paymentMethod,
      paymentDate: new Date(),
      paymentReceivedById: input.userId,
    },
  });

  await logAudit({
    companyId: shipment.companyId,
    userId: input.userId,
    action: "RECORD_PAYMENT",
    entityType: "Shipment",
    entityId: shipmentId,
    metadata: { amountPaid: input.amountPaid, paymentMethod: input.paymentMethod },
  });

  return shipment;
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
    const target = toStatus ?? (s.statusBeforeException as ShipmentStatus | null) ?? "RECEIVED";
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

export async function listExceptions(companyId: string, branchId?: string | null) {
  return prisma.shipment.findMany({
    where: { companyId, status: "EXCEPTION", ...(branchId ? shipmentTouchesBranch(branchId) : {}) },
    include: { customer: true, loadBranch: true, unloadBranch: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getShipmentByNumberPublic(shipmentNumber: string) {
  return prisma.shipment.findUnique({
    where: { shipmentNumber },
    include: {
      company: true,
      loadBranch: true,
      unloadBranch: true,
      currentBranch: true,
      trackingEvents: { where: { isCustomerVisible: true }, orderBy: { createdAt: "asc" } },
      // Only the status is exposed publicly — address/phone/provider ref stay server-side.
      deliveryRequest: { select: { status: true } },
    },
  });
}
