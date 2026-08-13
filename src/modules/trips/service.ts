import { prisma } from "@/lib/db";
import { nextTripNumber } from "@/lib/ids";
import { transitionShipmentStatusTx } from "@/modules/shipments/service";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { logAudit } from "@/lib/audit";
import { assertSameCompany } from "@/lib/tenant";
import { assertAnyBranchMatch, assertBranchMatch } from "@/lib/branch-scope";
import type { ShipmentEvent } from "@/lib/enums";

/** Throws if the trip doesn't belong to companyId, or — when `branchScope` is set — doesn't have
 * at least one stop at that branch. Every trip action must call this before mutating. */
export async function assertTripInCompany(companyId: string, tripId: string, branchScope?: string | null) {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { stops: true } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, trip.companyId);
  assertAnyBranchMatch(branchScope, trip.stops.map((s) => s.branchId));
  return trip;
}

/** Throws if the stop's trip doesn't belong to companyId, doesn't match the claimed tripId, or —
 * when `branchScope` is set — isn't the stop's own branch (a stop-level action physically happens
 * at one location, so this is an exact match, not "the trip touches this branch somewhere"). */
export async function assertStopInCompany(companyId: string, stopId: string, tripId?: string, branchScope?: string | null) {
  const stop = await prisma.tripStop.findUniqueOrThrow({ where: { id: stopId }, include: { trip: true } });
  assertSameCompany({ userType: "COMPANY_USER", companyId }, stop.trip.companyId);
  if (tripId && stop.tripId !== tripId) throw new Error("المحطة لا تنتمي لهذه الرحلة");
  assertBranchMatch(branchScope, stop.branchId);
  return stop;
}

export type CreateTripStopInput = {
  branchId: string;
  sequence: number;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  plannedArrival?: Date;
  plannedDeparture?: Date;
};

export async function createTrip(params: {
  companyId: string;
  vehicleId?: string;
  driverId?: string;
  stops: CreateTripStopInput[];
  userId?: string;
}) {
  const tripNumber = await nextTripNumber();
  const trip = await prisma.trip.create({
    data: {
      companyId: params.companyId,
      tripNumber,
      vehicleId: params.vehicleId,
      driverId: params.driverId,
      stops: {
        create: params.stops
          .sort((a, b) => a.sequence - b.sequence)
          .map((s) => ({
            branchId: s.branchId,
            sequence: s.sequence,
            loadingEnabled: s.loadingEnabled,
            unloadingEnabled: s.unloadingEnabled,
            plannedArrival: s.plannedArrival,
            plannedDeparture: s.plannedDeparture,
          })),
      },
    },
    include: { stops: true },
  });

  await logAudit({ companyId: params.companyId, userId: params.userId, action: "CREATE", entityType: "Trip", entityId: trip.id, metadata: { tripNumber } });
  return trip;
}

/**
 * Picks the trip's first stop at the shipment's load branch, and the first *later* stop at its
 * unload branch. A shipment already active on another (not-yet-unloaded) trip is rejected — the
 * eligibility list already excludes shipments linked to *this* trip, but without this check a
 * shipment could still be double-booked onto two different trips at once, corrupting both trips'
 * manifests. The whole read-check-write runs in one transaction so two concurrent "assign" clicks
 * for the same shipment can't both win.
 */
export async function autoAssignShipmentToTrip(tripId: string, shipmentId: string) {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { stops: { orderBy: { sequence: "asc" } } } });
  const shipment = await prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
  assertSameCompany({ userType: "COMPANY_USER", companyId: trip.companyId }, shipment.companyId);

  const loadStop = trip.stops.find((s) => s.branchId === shipment.loadBranchId && s.loadingEnabled);
  if (!loadStop) throw new Error("لا توجد محطة تحميل مطابقة لفرع تحميل الشحنة في هذه الرحلة");

  const unloadStop = trip.stops.find((s) => s.branchId === shipment.unloadBranchId && s.unloadingEnabled && s.sequence >= loadStop.sequence);
  if (!unloadStop) throw new Error("لا توجد محطة تفريغ مطابقة لفرع تفريغ الشحنة في هذه الرحلة");

  const link = await prisma.$transaction(async (tx) => {
    const activeElsewhere = await tx.tripShipmentStop.findFirst({ where: { shipmentId, unloadedAt: null } });
    if (activeElsewhere) throw new Error("الشحنة مرتبطة برحلة أخرى لم تُفرَّغ بعد");

    const created = await tx.tripShipmentStop.create({
      data: { tripId, shipmentId, loadStopId: loadStop.id, unloadStopId: unloadStop.id },
    });

    if (shipment.status === "REGISTERED") await transitionShipmentStatusTx(tx, shipmentId, "RECEIVED", {});
    if (shipment.status === "REGISTERED" || shipment.status === "RECEIVED") {
      await transitionShipmentStatusTx(tx, shipmentId, "READY_FOR_LOADING", {});
    }

    return created;
  });

  return link;
}

export async function getTripDetail(companyId: string, tripId: string, branchId?: string | null) {
  return prisma.trip.findFirst({
    where: { id: tripId, companyId, ...(branchId ? { stops: { some: { branchId } } } : {}) },
    include: {
      driver: true,
      vehicle: true,
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          branch: true,
          shipmentLoads: { include: { shipment: { include: { customer: true } } } },
          shipmentUnloads: { include: { shipment: { include: { customer: true } } } },
        },
      },
    },
  });
}

/** Every carton across every shipment linked to this trip, for one-click bulk label printing —
 * "trip-oriented" per the Phase 5 P1 batch-2 scope, not a general multi-shipment picker. */
export async function getTripCartonsForLabels(companyId: string, tripId: string, branchScope?: string | null) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, companyId, ...(branchScope ? { stops: { some: { branchId: branchScope } } } : {}) },
    select: { id: true, tripNumber: true },
  });
  if (!trip) return null;

  const links = await prisma.tripShipmentStop.findMany({
    where: { tripId },
    include: {
      shipment: {
        include: { loadBranch: true, unloadBranch: true, cartons: { orderBy: { cartonIndex: "asc" } } },
      },
    },
    orderBy: { shipment: { shipmentNumber: "asc" } },
  });

  return { trip, shipments: links.map((l) => l.shipment) };
}

export async function listTrips(companyId: string, branchId?: string | null, page = 1, pageSize = 20) {
  const where = { companyId, ...(branchId ? { stops: { some: { branchId } } } : {}) };

  const [items, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      include: { stops: { orderBy: { sequence: "asc" }, include: { branch: true } }, driver: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trip.count({ where }),
  ]);

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getUnassignedShipmentsForStop(companyId: string, tripId: string, branchId: string) {
  void tripId; // kept in the signature for call-site clarity even though eligibility is now trip-agnostic
  return prisma.shipment.findMany({
    where: {
      companyId,
      loadBranchId: branchId,
      status: { in: ["REGISTERED", "RECEIVED", "READY_FOR_LOADING"] },
      // Not just "not on *this* trip" — a shipment still active on any other trip must not be
      // offered here either, or the dialog would let staff double-book it (autoAssignShipmentToTrip
      // rejects that at write time, but showing it as pickable here is a confusing dead end).
      tripLinks: { none: { unloadedAt: null } },
    },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getStopManifest(stopId: string) {
  const stop = await prisma.tripStop.findUniqueOrThrow({
    where: { id: stopId },
    include: {
      branch: true,
      trip: true,
      shipmentLoads: { where: { loadedAt: null }, include: { shipment: { include: { customer: true } } } },
      shipmentUnloads: { where: { unloadedAt: null, loadedAt: { not: null } }, include: { shipment: { include: { customer: true } } } },
    },
  });

  const toLoadCartons = stop.shipmentLoads.reduce((sum, l) => sum + l.shipment.totalCartons, 0);
  const toUnloadCartons = stop.shipmentUnloads.reduce((sum, l) => sum + l.shipment.totalCartons, 0);

  return { stop, toLoadCartons, toUnloadCartons };
}

/**
 * Bulk confirm loading at a stop — updates every pending shipment/carton in one pass, no per-carton scans.
 * Race-safe: each row is claimed with a guarded `updateMany` (loadedAt: null in the WHERE), so two
 * concurrent confirms for the same stop can never both process the same shipment — the loser's claim
 * simply matches 0 rows and is skipped. Deferred notification dispatch happens after commit so a
 * WhatsApp failure can never roll back a real physical loading confirmation.
 */
export async function confirmBulkLoad(stopId: string, userId?: string) {
  const pendingEvents: { shipmentId: string; event: ShipmentEvent; trackingEventId: string }[] = [];
  const loadedShipmentIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const stop = await tx.tripStop.findUniqueOrThrow({ where: { id: stopId } });
    const links = await tx.tripShipmentStop.findMany({
      where: { loadStopId: stopId, loadedAt: null },
      include: { shipment: true },
    });

    let shipmentsLoaded = 0;
    let cartonsLoaded = 0;

    for (const link of links) {
      const claim = await tx.tripShipmentStop.updateMany({
        where: { id: link.id, loadedAt: null },
        data: { loadedAt: new Date(), cartonsLoaded: link.shipment.totalCartons },
      });
      if (claim.count === 0) continue; // already claimed by a concurrent request

      await tx.carton.updateMany({ where: { shipmentId: link.shipmentId }, data: { status: "LOADED" } });
      shipmentsLoaded += 1;
      cartonsLoaded += link.shipment.totalCartons;
      loadedShipmentIds.push(link.shipmentId);

      if (link.shipment.status === "READY_FOR_LOADING") {
        const { event, trackingEventId } = await transitionShipmentStatusTx(tx, link.shipmentId, "LOADED", { branchId: stop.branchId });
        if (event) pendingEvents.push({ shipmentId: link.shipmentId, event, trackingEventId });
      }
    }

    await tx.tripStop.update({ where: { id: stopId }, data: { status: "LOADING" } });
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: stop.tripId }, select: { companyId: true } });
    return { shipmentsLoaded, cartonsLoaded, companyId: trip.companyId };
  });

  if (loadedShipmentIds.length) {
    await logAudit({ companyId: result.companyId, userId, action: "BULK_LOAD", entityType: "TripStop", entityId: stopId, metadata: { shipmentIds: loadedShipmentIds } });
  }
  for (const { shipmentId, event, trackingEventId } of pendingEvents) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  return result;
}

/**
 * Bulk confirm unloading at a stop. Defaults to full arrival for every pending shipment; pass
 * `arrivedOverrides` to record fewer cartons than expected for specific shipments (the physical
 * count the employee/driver actually sees) — those land on PARTIALLY_ARRIVED instead of ARRIVED.
 * Race-safe via the same per-row guarded-claim pattern as confirmBulkLoad.
 */
export async function confirmBulkUnload(stopId: string, userId?: string, arrivedOverrides: Record<string, number> = {}) {
  const pendingEvents: { shipmentId: string; event: ShipmentEvent; trackingEventId: string }[] = [];
  const unloadedShipmentIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const stop = await tx.tripStop.findUniqueOrThrow({ where: { id: stopId } });
    const links = await tx.tripShipmentStop.findMany({
      where: { unloadStopId: stopId, unloadedAt: null, loadedAt: { not: null } },
      include: { shipment: true },
    });

    let shipmentsUnloaded = 0;
    let cartonsUnloaded = 0;

    for (const link of links) {
      const claim = await tx.tripShipmentStop.updateMany({ where: { id: link.id, unloadedAt: null }, data: { unloadedAt: new Date() } });
      if (claim.count === 0) continue; // already claimed by a concurrent request

      const total = link.shipment.totalCartons;
      const arrived = Math.min(total, Math.max(0, arrivedOverrides[link.shipmentId] ?? total));

      await tx.tripShipmentStop.update({ where: { id: link.id }, data: { cartonsUnloaded: arrived } });

      const cartons = await tx.carton.findMany({ where: { shipmentId: link.shipmentId }, orderBy: { cartonIndex: "asc" } });
      const arrivedIds = cartons.slice(0, arrived).map((c) => c.id);
      const missingIds = cartons.slice(arrived).map((c) => c.id);
      if (arrivedIds.length) await tx.carton.updateMany({ where: { id: { in: arrivedIds } }, data: { status: "ARRIVED" } });
      if (missingIds.length) await tx.carton.updateMany({ where: { id: { in: missingIds } }, data: { status: "MISSING" } });

      await tx.shipment.update({ where: { id: link.shipmentId }, data: { arrivedCartons: arrived } });
      const toStatus = arrived < total ? "PARTIALLY_ARRIVED" : "ARRIVED";
      const note = arrived < total ? `وصل ${arrived} من أصل ${total} كراتين` : undefined;
      const { event, trackingEventId } = await transitionShipmentStatusTx(tx, link.shipmentId, toStatus, { branchId: stop.branchId, note });
      if (event) pendingEvents.push({ shipmentId: link.shipmentId, event, trackingEventId });

      shipmentsUnloaded += 1;
      cartonsUnloaded += arrived;
      unloadedShipmentIds.push(link.shipmentId);
    }

    await tx.tripStop.update({ where: { id: stopId }, data: { status: "UNLOADING" } });
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: stop.tripId }, select: { companyId: true } });
    return { shipmentsUnloaded, cartonsUnloaded, companyId: trip.companyId };
  });

  if (unloadedShipmentIds.length) {
    await logAudit({ companyId: result.companyId, userId, action: "BULK_UNLOAD", entityType: "TripStop", entityId: stopId, metadata: { shipmentIds: unloadedShipmentIds } });
  }
  for (const { shipmentId, event, trackingEventId } of pendingEvents) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  return result;
}

/**
 * Marks the remaining (previously missing) cartons of a PARTIALLY_ARRIVED shipment as now arrived —
 * the "the rest showed up later" follow-up to confirmBulkUnload's partial path.
 */
export async function confirmRemainingArrived(shipmentId: string, userId?: string) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    await tx.carton.updateMany({ where: { shipmentId }, data: { status: "ARRIVED" } });
    await tx.shipment.update({ where: { id: shipmentId }, data: { arrivedCartons: s.totalCartons } });
    const result = await transitionShipmentStatusTx(tx, shipmentId, "ARRIVED", { note: "اكتمل وصول باقي الكراتين" });
    event = result.event;
    trackingEventId = result.trackingEventId;
    return result.shipment;
  });

  if (event) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  await logAudit({ companyId: shipment.companyId, userId, action: "STATUS_CHANGE", entityType: "Shipment", entityId: shipmentId, metadata: { note: "remaining cartons arrived" } });
  return shipment;
}

/**
 * Reports a carton-level exception outside the normal unload flow (e.g. a driver noticing a missing
 * carton after already confirming unload). Reconciles the TripShipmentStop bookkeeping too, so the
 * trip's "remaining to unload" count and completeTrip's guard stay accurate.
 */
export async function reportPartialArrival(shipmentId: string, arrivedCartons: number, userId?: string, note?: string) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const shipment = await prisma.$transaction(async (tx) => {
    const s = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId } });
    const arrived = Math.min(s.totalCartons, Math.max(0, arrivedCartons));

    const openLink = await tx.tripShipmentStop.findFirst({ where: { shipmentId, loadedAt: { not: null }, unloadedAt: null } });
    if (openLink) {
      await tx.tripShipmentStop.update({ where: { id: openLink.id }, data: { unloadedAt: new Date(), cartonsUnloaded: arrived } });
    }

    const cartons = await tx.carton.findMany({ where: { shipmentId }, orderBy: { cartonIndex: "asc" } });
    const arrivedIds = cartons.slice(0, arrived).map((c) => c.id);
    const missingIds = cartons.slice(arrived).map((c) => c.id);
    if (arrivedIds.length) await tx.carton.updateMany({ where: { id: { in: arrivedIds } }, data: { status: "ARRIVED" } });
    if (missingIds.length) await tx.carton.updateMany({ where: { id: { in: missingIds } }, data: { status: "MISSING" } });

    await tx.shipment.update({ where: { id: shipmentId }, data: { arrivedCartons: arrived } });
    const status = arrived < s.totalCartons ? "PARTIALLY_ARRIVED" : "ARRIVED";
    const result = await transitionShipmentStatusTx(tx, shipmentId, status, {
      note: note ?? `وصل ${arrived} من أصل ${s.totalCartons} كراتين`,
    });
    event = result.event;
    trackingEventId = result.trackingEventId;
    return result.shipment;
  });

  if (event) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
  await logAudit({ companyId: shipment.companyId, userId, action: "STATUS_CHANGE", entityType: "Shipment", entityId: shipmentId, metadata: { note: "partial arrival reported" } });
  return shipment;
}

/** Trip departs a stop: shipments just loaded here move to IN_TRANSIT; shipments still onboard get a pass-through tracking entry. */
export async function departStop(tripId: string, stopId: string, userId?: string) {
  const pendingEvents: { shipmentId: string; event: ShipmentEvent; trackingEventId: string }[] = [];

  const companyId = await prisma.$transaction(async (tx) => {
    const claim = await tx.tripStop.updateMany({ where: { id: stopId, status: { not: "DEPARTED" } }, data: { status: "DEPARTED", actualDeparture: new Date() } });
    if (claim.count === 0) return null; // already departed — idempotent no-op on double-click

    const stop = await tx.tripStop.findUniqueOrThrow({ where: { id: stopId }, include: { branch: true } });
    const onboard = await tx.tripShipmentStop.findMany({
      where: { tripId, loadedAt: { not: null }, unloadedAt: null },
      include: { shipment: true },
    });

    const trip = await tx.trip.update({ where: { id: tripId }, data: { status: "IN_PROGRESS" } });

    for (const link of onboard) {
      if (link.shipment.status === "LOADED") {
        const { event, trackingEventId } = await transitionShipmentStatusTx(tx, link.shipmentId, "IN_TRANSIT", {});
        if (event) pendingEvents.push({ shipmentId: link.shipmentId, event, trackingEventId });
      } else if (link.shipment.status === "IN_TRANSIT" && link.unloadStopId !== stopId) {
        await tx.trackingEvent.create({
          data: { shipmentId: link.shipmentId, eventType: "AT_INTERMEDIATE_STOP", title: `غادرت الرحلة من ${stop.branch.name}` },
        });
      }
    }

    return trip.companyId;
  });

  if (companyId) await logAudit({ companyId, userId, action: "DEPART_STOP", entityType: "TripStop", entityId: stopId });
  for (const { shipmentId, event, trackingEventId } of pendingEvents) await dispatchShipmentEvent(event, shipmentId, trackingEventId);
}

export async function completeTrip(tripId: string, companyId: string, userId?: string) {
  await prisma.$transaction(async (tx) => {
    const remaining = await tx.tripShipmentStop.count({ where: { tripId, unloadedAt: null } });
    if (remaining > 0) throw new Error("لا يمكن إنهاء الرحلة قبل تفريغ جميع الشحنات");

    // companyId is part of the WHERE, not just the audit metadata — a trip belonging to another
    // tenant matches 0 rows here instead of silently completing.
    const claim = await tx.trip.updateMany({ where: { id: tripId, companyId, status: { not: "COMPLETED" } }, data: { status: "COMPLETED" } });
    if (claim.count === 0) throw new Error("الرحلة غير موجودة أو منتهية بالفعل");
  });

  await logAudit({ companyId, userId, action: "COMPLETE", entityType: "Trip", entityId: tripId });
}
