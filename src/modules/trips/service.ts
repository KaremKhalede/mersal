import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { nextTripNumber } from "@/lib/ids";
import { transitionShipmentStatusTx } from "@/modules/shipments/service";
import { dispatchShipmentEvent } from "@/modules/notifications/service";
import { logAudit } from "@/lib/audit";
import { assertSameCompany } from "@/lib/tenant";
import { assertAnyBranchMatch, assertBranchMatch } from "@/lib/branch-scope";
import type { ShipmentEvent } from "@/lib/enums";

/** Throws if the trip doesn't belong to companyId, or — when `branchScope` is set — doesn't have
 * at least one stop at that branch. Every trip action must call this before mutating. */
/**
 * "This shipment is physically on a truck right now."
 *
 * The predicate three separate call sites got wrong in the same way: they asked `unloadedAt: null`,
 * which is true both for a shipment still riding on a trip AND for one that was merely *planned*
 * onto a trip and never actually loaded. Those are opposite facts. A planned-but-never-loaded link
 * blocked the trip from ever completing, and blocked the shipment from ever joining another trip —
 * a shipment sitting untouched at the origin branch could be stranded forever by a trip that had
 * already come and gone.
 *
 * `loadedAt` is what makes it real: nothing is aboard until someone confirmed loading it.
 */
const ONBOARD = { loadedAt: { not: null }, unloadedAt: null } as const;

/** A completed trip is finished: no more loading, unloading, or departing at any of its stops. */
async function assertTripOpen(tx: Prisma.TransactionClient, tripId: string) {
  const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { status: true } });
  if (trip.status === "COMPLETED") throw new Error("الرحلة منتهية — لا يمكن تعديل محطاتها");
  return trip;
}

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

/**
 * The driver-side twin of assertStopInCompany, and the guard every driver mutation was missing.
 *
 * A driver's ownership boundary is Trip.driverId, not a company/branch scope — but the *stop* still
 * has to belong to the trip they claimed. The driver actions checked only the trip, then passed the
 * caller's `stopId` straight to confirmBulkLoad/confirmBulkUnload/departStop, each of which resolves
 * the stop by id on its own. A driver holding any other trip's stop id (any company's) could
 * therefore confirm loading or unloading on it: flipping another tenant's shipment statuses, marking
 * their cartons MISSING, and firing WhatsApp messages to their customers.
 *
 * Lives here rather than in the "use server" actions file for the same reason every other assert in
 * this module does: it is directly callable from tests without a request context.
 */
export async function assertDriverTripStop(driverId: string, tripId: string, stopId: string) {
  const trip = await prisma.trip.findFirst({ where: { id: tripId, driverId } });
  if (!trip) throw new Error("هذه الرحلة ليست ضمن رحلاتك");
  const stop = await prisma.tripStop.findFirst({ where: { id: stopId, tripId } });
  if (!stop) throw new Error("المحطة لا تنتمي لهذه الرحلة");
  return { trip, stop };
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
    const activeElsewhere = await tx.tripShipmentStop.findFirst({ where: { shipmentId, ...ONBOARD } });
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
          // unloadBranch rides along because the driver's stop manifest has to answer "where does
          // this shipment get off" for every row it lists — the one field that was missing from an
          // include that already carries everything else that screen needs.
          shipmentLoads: { include: { shipment: { include: { customer: true, unloadBranch: true } } } },
          // Cartons ride along on the unload side only: confirming an unload is the one action that
          // needs each carton by identity (which ones did not come off), and loading has no such
          // question — it is still confirmed per shipment.
          shipmentUnloads: {
            include: {
              shipment: {
                include: {
                  customer: true,
                  unloadBranch: true,
                  cartons: { orderBy: { cartonIndex: "asc" }, select: { id: true, cartonIndex: true, cartonCode: true, status: true } },
                },
              },
            },
          },
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

/**
 * Read model for the trip's manifest ("كشف حمولة الرحلة") — everything derived live from the trip
 * and its linked shipments, nothing stored. Origin/destination are the trip's first and last stop
 * (Trip has no separate from/to fields); weight is only totaled when every linked shipment has one,
 * since a partial sum would misleadingly read as the trip's real total.
 */
export async function getTripManifest(companyId: string, tripId: string, branchScope?: string | null) {
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, companyId, ...(branchScope ? { stops: { some: { branchId: branchScope } } } : {}) },
    include: {
      driver: true,
      vehicle: true,
      stops: { orderBy: { sequence: "asc" }, include: { branch: true } },
    },
  });
  if (!trip) return null;

  const links = await prisma.tripShipmentStop.findMany({
    where: { tripId },
    include: { shipment: { include: { customer: true, unloadBranch: true } } },
    orderBy: { shipment: { shipmentNumber: "asc" } },
  });
  const shipments = links.map((l) => l.shipment);
  const weights = shipments.map((s) => s.weightKg);

  return {
    trip,
    origin: trip.stops[0]?.branch ?? null,
    destination: trip.stops[trip.stops.length - 1]?.branch ?? null,
    shipments,
    totalCartons: shipments.reduce((sum, s) => sum + s.totalCartons, 0),
    totalWeightKg: weights.every((w) => w != null) && weights.length > 0 ? weights.reduce((sum, w) => sum + (w ?? 0), 0) : null,
  };
}

/**
 * `status` filters the list to one TripStatus — the one filter this page genuinely needs, since
 * "which trips are still on the road" is a different daily question from "what did we run last
 * month" and a 20-row page mixes the two.
 *
 * Each row also carries its own load (`shipmentCount`/`cartonCount`, counted from the links that
 * are still onboard, i.e. not yet unloaded) so the table can answer "how big is this trip" without
 * opening it. Same shape the dashboard's active-trips panel already computes, so the two agree.
 */
export async function listTrips(
  companyId: string,
  branchId?: string | null,
  page = 1,
  pageSize = 20,
  status?: string
) {
  const where = {
    companyId,
    ...(branchId ? { stops: { some: { branchId } } } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.trip.findMany({
      where,
      include: {
        stops: { orderBy: { sequence: "asc" }, include: { branch: true } },
        driver: true,
        vehicle: { select: { plateNumber: true } },
        shipmentLinks: { where: { unloadedAt: null }, include: { shipment: { select: { totalCartons: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.trip.count({ where }),
  ]);

  return {
    items: items.map(({ shipmentLinks, ...t }) => ({
      ...t,
      shipmentCount: shipmentLinks.length,
      cartonCount: shipmentLinks.reduce((sum, l) => sum + l.shipment.totalCartons, 0),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
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
      tripLinks: { none: ONBOARD },
    },
    // A narrow select, not `include: { customer: true }` on the full row — the caller (a Server
    // Component) passes this straight into AssignShipmentDialog, a Client Component; the full
    // Shipment row carries Prisma Decimal fields (amountPaid, shippingPrice, declaredValue) that
    // aren't plain-object serializable across that boundary. Select only what the dialog renders.
    select: { id: true, shipmentNumber: true, totalCartons: true, customer: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Every shipment that would successfully link to a trip built from these (not-yet-created) stops —
 * for the "new trip" page's shipment-suggestion panel, so staff confirm a proposed batch instead of
 * hunting one by one. Mirrors autoAssignShipmentToTrip's own match rule exactly (load stop by branch,
 * unload stop by branch at or after it in sequence) so nothing suggested here could ever fail at
 * creation time.
 */
export async function suggestShipmentsForStops(
  companyId: string,
  stops: { branchId: string; sequence: number; loadingEnabled: boolean; unloadingEnabled: boolean }[]
) {
  const loadStops = stops.filter((s) => s.loadingEnabled);
  const unloadStops = stops.filter((s) => s.unloadingEnabled);
  if (loadStops.length === 0 || unloadStops.length === 0) return [];

  const candidates = await prisma.shipment.findMany({
    where: {
      companyId,
      loadBranchId: { in: loadStops.map((s) => s.branchId) },
      unloadBranchId: { in: unloadStops.map((s) => s.branchId) },
      status: { in: ["REGISTERED", "RECEIVED", "READY_FOR_LOADING"] },
      // Same ONBOARD rule as the per-stop picker: only a shipment genuinely riding another trip is
      // ineligible. One left behind by a trip that has since finished is free again.
      tripLinks: { none: ONBOARD },
    },
    select: {
      id: true, shipmentNumber: true, totalCartons: true, loadBranchId: true, unloadBranchId: true,
      customer: { select: { name: true } }, loadBranch: { select: { name: true } }, unloadBranch: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return candidates.filter((s) => {
    const loadStop = loadStops.find((ls) => ls.branchId === s.loadBranchId);
    if (!loadStop) return false;
    return unloadStops.some((us) => us.branchId === s.unloadBranchId && us.sequence >= loadStop.sequence);
  });
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
    await assertTripOpen(tx, stop.tripId);
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

      // A carton recorded MISSING is not on the truck, whatever the shipment as a whole is doing —
      // a shipment can come back through EXCEPTION and be loaded again, and that must not quietly
      // resurrect the box nobody has seen.
      await tx.carton.updateMany({ where: { shipmentId: link.shipmentId, status: { not: "MISSING" } }, data: { status: "LOADED" } });
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
/**
 * Bulk confirm unloading at a stop, recording which cartons actually came off.
 *
 * `missingCartonIds` is the whole point of this signature. It replaced `arrivedOverrides`, a
 * per-shipment *count*, which forced this function to invent identity: it marked `cartons.slice(0,
 * arrived)` as arrived and the tail as MISSING, so "which carton is missing" was always "the
 * last ones by index" — an answer that is right only by luck. A shipment where C3 never made it
 * recorded C5 as the missing one, and every downstream screen, tracking note and dispute repeated
 * that. Carton.status already modelled identity correctly; only this write path lied.
 *
 * The default is "everything arrived": callers pass ids only for cartons that are genuinely not
 * there, which is the rare case. Ids are checked against the cartons of the shipments actually
 * being unloaded at this stop, so a carton from another stop, another trip or another company is
 * rejected rather than silently marked missing.
 */
export async function confirmBulkUnload(stopId: string, userId?: string, missingCartonIds: string[] = []) {
  const pendingEvents: { shipmentId: string; event: ShipmentEvent; trackingEventId: string }[] = [];
  const unloadedShipmentIds: string[] = [];

  const result = await prisma.$transaction(async (tx) => {
    const stop = await tx.tripStop.findUniqueOrThrow({ where: { id: stopId } });
    await assertTripOpen(tx, stop.tripId);
    const links = await tx.tripShipmentStop.findMany({
      where: { unloadStopId: stopId, unloadedAt: null, loadedAt: { not: null } },
      include: { shipment: true },
    });

    // One read for every carton in play, so ownership can be checked before anything is written:
    // an id that is not on one of this stop's shipments must not be able to mark anything missing.
    const stopCartons = await tx.carton.findMany({
      where: { shipmentId: { in: links.map((l) => l.shipmentId) } },
      orderBy: { cartonIndex: "asc" },
    });
    const ownIds = new Set(stopCartons.map((c) => c.id));
    for (const id of missingCartonIds) {
      if (!ownIds.has(id)) throw new Error("كرتون محدد لا ينتمي لشحنات هذه المحطة");
    }
    const missingSet = new Set(missingCartonIds);

    let shipmentsUnloaded = 0;
    let cartonsUnloaded = 0;

    for (const link of links) {
      const claim = await tx.tripShipmentStop.updateMany({ where: { id: link.id, unloadedAt: null }, data: { unloadedAt: new Date() } });
      if (claim.count === 0) continue; // already claimed by a concurrent request

      const cartons = stopCartons.filter((c) => c.shipmentId === link.shipmentId);
      const missing = cartons.filter((c) => missingSet.has(c.id));
      const arrivedIds = cartons.filter((c) => !missingSet.has(c.id)).map((c) => c.id);
      // Counted from the cartons themselves, never from a number someone typed — the count and the
      // identities can no longer disagree because one is derived from the other.
      const arrived = arrivedIds.length;
      const total = cartons.length;

      await tx.tripShipmentStop.update({ where: { id: link.id }, data: { cartonsUnloaded: arrived } });

      if (arrivedIds.length) await tx.carton.updateMany({ where: { id: { in: arrivedIds } }, data: { status: "ARRIVED" } });
      if (missing.length) await tx.carton.updateMany({ where: { id: { in: missing.map((c) => c.id) } }, data: { status: "MISSING" } });

      await tx.shipment.update({ where: { id: link.shipmentId }, data: { arrivedCartons: arrived } });
      const toStatus = arrived < total ? "PARTIALLY_ARRIVED" : "ARRIVED";
      // The timeline names the cartons, not just a shortfall: "4 من 5" sends the office counting
      // boxes again, "لم يصل: SH-...-C3" is actionable on its own.
      const note = missing.length ? `وصل ${arrived} من أصل ${total} كراتين — لم يصل: ${missing.map((c) => c.cartonCode).join("، ")}` : undefined;
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
  // Deliberately the ONE path allowed to clear MISSING: it means "the boxes turned up after all".
  // Every other write path now preserves MISSING, so this stays the single, explicit, auditable
  // place where a missing carton stops being missing — never a side effect of a handover.
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
 *
 * Takes the missing cartons by id for the same reason confirmBulkUnload does: this path used to
 * accept a count and slice the tail off by index, so a driver reporting "one carton short" always
 * blamed the highest-numbered one. Two write paths inventing identity the same wrong way is not
 * half a bug — leaving this one alone would have kept the shipment record untrustworthy through
 * the exact flow people use when something has already gone wrong.
 */
export async function reportPartialArrival(shipmentId: string, missingCartonIds: string[], userId?: string, note?: string) {
  let event: ShipmentEvent | undefined;
  let trackingEventId: string | undefined;

  const shipment = await prisma.$transaction(async (tx) => {
    const cartons = await tx.carton.findMany({ where: { shipmentId }, orderBy: { cartonIndex: "asc" } });
    const ownIds = new Set(cartons.map((c) => c.id));
    for (const id of missingCartonIds) {
      if (!ownIds.has(id)) throw new Error("كرتون محدد لا ينتمي لهذه الشحنة");
    }

    const missingSet = new Set(missingCartonIds);
    const missing = cartons.filter((c) => missingSet.has(c.id));
    const arrivedIds = cartons.filter((c) => !missingSet.has(c.id)).map((c) => c.id);
    const arrived = arrivedIds.length;

    const openLink = await tx.tripShipmentStop.findFirst({ where: { shipmentId, loadedAt: { not: null }, unloadedAt: null } });
    if (openLink) {
      await tx.tripShipmentStop.update({ where: { id: openLink.id }, data: { unloadedAt: new Date(), cartonsUnloaded: arrived } });
    }

    if (arrivedIds.length) await tx.carton.updateMany({ where: { id: { in: arrivedIds } }, data: { status: "ARRIVED" } });
    if (missing.length) await tx.carton.updateMany({ where: { id: { in: missing.map((c) => c.id) } }, data: { status: "MISSING" } });

    await tx.shipment.update({ where: { id: shipmentId }, data: { arrivedCartons: arrived } });
    const status = arrived < cartons.length ? "PARTIALLY_ARRIVED" : "ARRIVED";
    const missingNote = missing.length ? `لم يصل: ${missing.map((c) => c.cartonCode).join("، ")}` : "وصلت كل الكراتين";
    const result = await transitionShipmentStatusTx(tx, shipmentId, status, {
      note: note ? `${note} — ${missingNote}` : missingNote,
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
    // Completing a trip is now possible while some planned shipment was never loaded, which makes
    // "this trip is over" a state its stops must actually respect — otherwise the stop buttons
    // would still be live on a finished trip and could load cargo onto a truck that came back days
    // ago.
    await assertTripOpen(tx, tripId);
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
    // Only cartons actually aboard can block the trip from closing. A shipment that was planned
    // onto this trip and never loaded stayed at its origin branch — the truck cannot be waiting to
    // unload something it never picked up.
    const remaining = await tx.tripShipmentStop.count({ where: { tripId, ...ONBOARD } });
    if (remaining > 0) throw new Error("لا يمكن إنهاء الرحلة قبل تفريغ جميع الشحنات");

    // companyId is part of the WHERE, not just the audit metadata — a trip belonging to another
    // tenant matches 0 rows here instead of silently completing.
    const claim = await tx.trip.updateMany({ where: { id: tripId, companyId, status: { not: "COMPLETED" } }, data: { status: "COMPLETED" } });
    if (claim.count === 0) throw new Error("الرحلة غير موجودة أو منتهية بالفعل");
  });

  await logAudit({ companyId, userId, action: "COMPLETE", entityType: "Trip", entityId: tripId });
}
