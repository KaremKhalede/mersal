import { prisma } from "@/lib/db";

export async function companyDashboard(companyId: string) {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

  const [total, today, inTransit, arrived, readyForPickup, delivered, cartons, activeTrips, exceptions] = await Promise.all([
    prisma.shipment.count({ where: { companyId } }),
    prisma.shipment.count({ where: { companyId, createdAt: { gte: todayStart } } }),
    prisma.shipment.count({ where: { companyId, status: { in: ["IN_TRANSIT", "AT_INTERMEDIATE_STOP"] } } }),
    prisma.shipment.count({ where: { companyId, status: "ARRIVED" } }),
    prisma.shipment.count({ where: { companyId, status: "READY_FOR_PICKUP" } }),
    prisma.shipment.count({ where: { companyId, status: "DELIVERED" } }),
    prisma.carton.count({ where: { shipment: { companyId } } }),
    prisma.trip.count({ where: { companyId, status: "IN_PROGRESS" } }),
    prisma.shipment.count({ where: { companyId, status: "EXCEPTION" } }),
  ]);

  const byStatus = await prisma.shipment.groupBy({ by: ["status"], where: { companyId }, _count: true });
  const recent = await prisma.shipment.findMany({
    where: { companyId },
    include: { customer: true, loadBranch: true, unloadBranch: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  // Shipments that need a human's attention right now — the dashboard's "needs action" panel.
  const needsAction = await prisma.shipment.findMany({
    where: { companyId, status: { in: ["EXCEPTION", "PARTIALLY_ARRIVED"] } },
    include: { customer: true, loadBranch: true, unloadBranch: true },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  // Trips actually on the road right now, not just a count.
  const activeTripsList = await prisma.trip.findMany({
    where: { companyId, status: "IN_PROGRESS" },
    include: {
      driver: true,
      stops: { orderBy: { sequence: "asc" }, include: { branch: true } },
      shipmentLinks: { where: { unloadedAt: null } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  // Every real transition already writes a TrackingEvent — read today's counts from that instead
  // of adding any new write path.
  const todayEventGroups = await prisma.trackingEvent.groupBy({
    by: ["eventType"],
    where: { shipment: { companyId }, createdAt: { gte: todayStart } },
    _count: true,
  });
  const todayActivity = Object.fromEntries(todayEventGroups.map((g) => [g.eventType, g._count]));

  return {
    total, today, inTransit, arrived, readyForPickup, delivered, cartons, activeTrips, exceptions,
    byStatus, recent, needsAction, activeTripsList, todayActivity,
  };
}

export async function branchPerformance(companyId: string) {
  // Two grouped aggregates instead of 2×N per-branch queries — flat cost regardless of branch count.
  const [branches, loadedGroups, unloadedGroups] = await Promise.all([
    prisma.branch.findMany({ where: { companyId } }),
    prisma.shipment.groupBy({ by: ["loadBranchId"], where: { companyId }, _count: true }),
    prisma.shipment.groupBy({ by: ["unloadBranchId"], where: { companyId }, _count: true }),
  ]);

  const loadedById = new Map(loadedGroups.map((g) => [g.loadBranchId, g._count]));
  const unloadedById = new Map(unloadedGroups.map((g) => [g.unloadBranchId, g._count]));

  return branches.map((b) => ({
    branch: b,
    loaded: loadedById.get(b.id) ?? 0,
    unloaded: unloadedById.get(b.id) ?? 0,
  }));
}

export async function globalSearch(companyId: string, q: string) {
  if (!q.trim()) return { shipments: [], customers: [], trips: [] };
  // Shipment/trip numbers are always upper-case — normalize the query rather than relying on
  // Prisma's `mode: "insensitive"`, which SQLite doesn't support (keeps behavior Postgres-stable).
  const qUpper = q.toUpperCase();
  const [shipments, customers, trips] = await Promise.all([
    prisma.shipment.findMany({
      where: { companyId, OR: [{ shipmentNumber: { contains: qUpper } }, { receiverName: { contains: q } }, { receiverPhone: { contains: q } }] },
      take: 8,
    }),
    prisma.customer.findMany({ where: { companyId, OR: [{ name: { contains: q } }, { phone: { contains: q } }] }, take: 5 }),
    prisma.trip.findMany({ where: { companyId, tripNumber: { contains: qUpper } }, take: 5 }),
  ]);
  return { shipments, customers, trips };
}
