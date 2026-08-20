import { prisma } from "@/lib/db";
import { stopTiming } from "@/lib/stop-timing";
import { shipmentTouchesBranch } from "@/lib/branch-scope";
import { formatBusinessDateTime } from "@/lib/timezone";

/**
 * The company dashboard's read model.
 *
 * `branchScope` follows the same convention as every other scoped query (src/lib/branch-scope.ts):
 * null = company-wide, a branchId = only shipments touching that branch and only trips with a stop
 * there. Passing it is not cosmetic — without it a branch-scoped employee saw company-wide counts
 * and a "أحدث الشحنات" table linking to shipments whose detail page (already scoped) answers 404.
 *
 * Everything returned here is rendered by src/app/app/page.tsx. Deliberately nothing more: this
 * function previously also computed today/arrived/delivered/cartons/byStatus/needsAction/
 * todayActivity — eight extra aggregates, two of them findMany-with-includes, that no caller read.
 */
export async function companyDashboard(companyId: string, branchScope?: string | null) {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const shipmentWhere = { companyId, ...(branchScope ? shipmentTouchesBranch(branchScope) : {}) };
  const tripWhere = { companyId, ...(branchScope ? { stops: { some: { branchId: branchScope } } } : {}) };

  const [inTransit, readyForLoading, deliveredToday, activeTrips, exceptions] = await Promise.all([
    prisma.shipment.count({ where: { ...shipmentWhere, status: { in: ["IN_TRANSIT", "AT_INTERMEDIATE_STOP"] } } }),
    // "ما الذي يحتاج تحميل؟" — on a trip, awaiting the loading confirmation at its origin stop.
    // One status, so the card's link (/app/shipments?status=READY_FOR_LOADING) lands on exactly
    // the rows the number counted.
    prisma.shipment.count({ where: { ...shipmentWhere, status: "READY_FOR_LOADING" } }),
    // Proxy for "delivered today": DELIVERED shipments last touched today. There's no dedicated
    // deliveredAt column, and updatedAt already gets bumped on the transition that sets this status.
    prisma.shipment.count({ where: { ...shipmentWhere, status: "DELIVERED", updatedAt: { gte: todayStart } } }),
    prisma.trip.count({ where: { ...tripWhere, status: "IN_PROGRESS" } }),
    prisma.shipment.count({ where: { ...shipmentWhere, status: "EXCEPTION" } }),
  ]);

  const recent = await prisma.shipment.findMany({
    where: shipmentWhere,
    include: { customer: true, loadBranch: true, unloadBranch: true },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  // Trips actually on the road right now, not just a count.
  const activeTripsListRaw = await prisma.trip.findMany({
    where: { ...tripWhere, status: "IN_PROGRESS" },
    include: {
      driver: true,
      stops: { orderBy: { sequence: "asc" }, include: { branch: true } },
      shipmentLinks: { where: { unloadedAt: null } },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  // Same "what's next" rule as the driver app and trip detail page — the first stop not yet
  // wrapped up — so the dashboard's timing badge always agrees with what the trip page itself shows.
  const activeTripsList = activeTripsListRaw.map((t) => {
    const currentStop = t.stops.find((s) => s.status !== "DEPARTED" && s.status !== "DONE") ?? t.stops[t.stops.length - 1];
    return {
      ...t,
      currentStop,
      timing: currentStop ? stopTiming(currentStop.plannedArrival, currentStop.actualArrival) : null,
      shipmentCount: t.shipmentLinks.length,
      cartonCount: t.shipmentLinks.reduce((sum, l) => sum + l.cartonsLoaded, 0),
    };
  });

  // Unified activity feed — same TrackingEvent rows the shipment detail page's tracking tab
  // already renders, just company-wide and most-recent-first instead of scoped to one shipment.
  const recentActivity = await prisma.trackingEvent.findMany({
    where: { shipment: shipmentWhere },
    include: { shipment: { include: { customer: true } } },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  return { inTransit, readyForLoading, deliveredToday, activeTrips, exceptions, recent, activeTripsList, recentActivity };
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

/** AST calendar-day key, ASCII-sortable (en-CA -> yyyy-mm-dd) — grouping by UTC day would put a
 * late-night AST shipment in the wrong bucket (see timezone.ts's BUSINESS_TIMEZONE docstring). */
function businessDayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Exhaustive over every non-cancelled status (see `where` below, which excludes CANCELLED) — the
// donut has no "other" slice to explain away, every bucket below is one clear pipeline stage.
const STATUS_BUCKETS = [
  { key: "DELIVERED", label: "تم التسليم", tone: "success" as const, statuses: ["DELIVERED"] },
  {
    key: "IN_TRANSIT",
    label: "في الطريق",
    tone: "primary" as const,
    statuses: ["DRAFT", "REGISTERED", "RECEIVED", "READY_FOR_LOADING", "LOADED", "IN_TRANSIT", "AT_INTERMEDIATE_STOP", "ARRIVED", "DELIVERY_REQUESTED", "OUT_FOR_DELIVERY"],
  },
  { key: "READY_FOR_PICKUP", label: "جاهزة للتسليم", tone: "warning" as const, statuses: ["READY_FOR_PICKUP"] },
  { key: "EXCEPTION", label: "استثناء", tone: "destructive" as const, statuses: ["PARTIALLY_ARRIVED", "EXCEPTION"] },
];

export type PeriodReportFilters = {
  from: Date;
  to: Date;
  /** Load-branch filter — the "كل الفرع" selector. */
  branchId?: string;
  /** Unload-branch filter — the "كل الوجهات" selector. */
  destinationId?: string;
  /** Own-branch access restriction for branch-scoped roles (see branch-scope.ts) — distinct from
   * `branchId`/`destinationId`, which are the user's own filter picks. */
  branchScope?: string | null;
};

/** Backs /app/reports — one company-scoped slice over an arbitrary date range, by status, by day,
 * and by branch (both as origin and as destination). Every number here derives from the same
 * `shipments` fetch so the stat cards, donut, chart, and tables can never disagree with each other. */
export async function periodReport(companyId: string, filters: PeriodReportFilters) {
  const { from, to, branchId, destinationId, branchScope } = filters;
  const where = {
    companyId,
    createdAt: { gte: from, lte: to },
    // Same convention as financeSummary — a cancelled shipment isn't "activity" for reporting.
    status: { not: "CANCELLED" },
    ...(branchId ? { loadBranchId: branchId } : {}),
    ...(destinationId ? { unloadBranchId: destinationId } : {}),
    ...(branchScope ? shipmentTouchesBranch(branchScope) : {}),
  };

  const [shipments, branches] = await Promise.all([
    prisma.shipment.findMany({ where, select: { createdAt: true, totalCartons: true, status: true, loadBranchId: true, unloadBranchId: true } }),
    prisma.branch.findMany({ where: { companyId } }),
  ]);

  const total = shipments.length;
  const cartons = shipments.reduce((s, x) => s + x.totalCartons, 0);
  const delivered = shipments.filter((s) => s.status === "DELIVERED").length;

  const bucketCounts = STATUS_BUCKETS.map((b) => ({ ...b, count: shipments.filter((s) => b.statuses.includes(s.status)).length }));
  const other = Math.max(0, total - bucketCounts.reduce((s, b) => s + b.count, 0));
  const byStatus = other > 0 ? [...bucketCounts, { key: "OTHER", label: "أخرى", tone: "muted" as const, count: other }] : bucketCounts;

  const dailyMap = new Map<string, number>();
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) dailyMap.set(businessDayKey(d), 0);
  for (const s of shipments) dailyMap.set(businessDayKey(s.createdAt), (dailyMap.get(businessDayKey(s.createdAt)) ?? 0) + 1);
  const dailyActivity = [...dailyMap.entries()].map(([key, count]) => ({
    key,
    label: formatBusinessDateTime(new Date(`${key}T12:00:00Z`), { day: "numeric", month: "long" }),
    count,
  }));

  const branchById = new Map(branches.map((b) => [b.id, b]));
  function topByField(field: "loadBranchId" | "unloadBranchId") {
    const agg = new Map<string, { shipments: number; cartons: number }>();
    for (const s of shipments) {
      const id = s[field];
      const cur = agg.get(id) ?? { shipments: 0, cartons: 0 };
      cur.shipments += 1;
      cur.cartons += s.totalCartons;
      agg.set(id, cur);
    }
    return [...agg.entries()]
      .map(([id, v]) => ({ branch: branchById.get(id), ...v, pct: cartons > 0 ? Math.round((v.cartons / cartons) * 100) : 0 }))
      .filter((r): r is typeof r & { branch: NonNullable<typeof r.branch> } => !!r.branch)
      .sort((a, b) => b.cartons - a.cartons);
  }

  return {
    total,
    cartons,
    delivered,
    byStatus,
    dailyActivity,
    topBranches: topByField("loadBranchId"),
    topDestinations: topByField("unloadBranchId"),
    branches,
  };
}

/**
 * Top-bar search across shipments, customers and trips.
 *
 * `branchScope` is not optional decoration — this was the one read surface in the app that filtered
 * by company alone. A branch employee typing a name or a phone number got back shipment numbers,
 * receiver names and customer phone numbers from every other branch. Opening a result still 404'd
 * (the detail pages have always been scoped), so nothing could be *acted* on — but the search
 * results themselves were the leak, and "you can see it but not open it" is not branch isolation.
 *
 * Each predicate is the same one that resource's own list page already uses, so a search result set
 * is by construction a subset of what the employee could reach by browsing:
 *   - shipments: load/unload/current branch matches (shipmentTouchesBranch)
 *   - trips:     at least one stop at the branch
 *   - customers: home branch matches, OR they have a shipment that touches the branch — the same
 *                two-sided rule listCustomers uses, because a customer's home branch can be unset
 *                or different from where they most recently shipped.
 * A null scope (company-wide role, platform admin) leaves every clause off, exactly as before.
 */
export async function globalSearch(companyId: string, q: string, branchScope?: string | null) {
  if (!q.trim()) return { shipments: [], customers: [], trips: [] };
  // Shipment/trip numbers are always upper-case — normalize the query rather than relying on
  // Prisma's `mode: "insensitive"`, which SQLite doesn't support (keeps behavior Postgres-stable).
  const qUpper = q.toUpperCase();
  const [shipments, customers, trips] = await Promise.all([
    prisma.shipment.findMany({
      where: {
        companyId,
        AND: [
          branchScope ? shipmentTouchesBranch(branchScope) : {},
          { OR: [{ shipmentNumber: { contains: qUpper } }, { receiverName: { contains: q } }, { receiverPhone: { contains: q } }] },
        ],
      },
      take: 8,
    }),
    prisma.customer.findMany({
      where: {
        companyId,
        AND: [
          branchScope
            ? { OR: [{ homeBranchId: branchScope }, { shipments: { some: shipmentTouchesBranch(branchScope) } }] }
            : {},
          { OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
        ],
      },
      take: 5,
    }),
    prisma.trip.findMany({
      where: {
        companyId,
        tripNumber: { contains: qUpper },
        ...(branchScope ? { stops: { some: { branchId: branchScope } } } : {}),
      },
      take: 5,
    }),
  ]);
  return { shipments, customers, trips };
}
