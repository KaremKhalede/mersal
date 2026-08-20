import { prisma } from "@/lib/db";
import { FULL_PERMISSIONS } from "@/lib/enums";
import bcrypt from "bcryptjs";

export async function listCompanies() {
  return prisma.company.findMany({
    include: { _count: { select: { branches: true, shipments: true, users: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Everything the platform's company-detail page shows: identity, the owner account, and this
 * month's activity. Counts are scoped to the selected month because that's the window the page
 * labels them with — all-time totals would silently contradict the label.
 *
 * Cartons come from the carton-fee ledger (it carries companyId; Carton itself only links to a
 * shipment), keeping this consistent with every other carton figure in the app.
 */
export async function getCompanyDetail(companyId: string, month: Date = new Date()) {
  const { start, end } = monthRange(month);

  const [company, owner, cartons, shipments, trips] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      include: { branches: true, _count: { select: { shipments: true, trips: true, users: true, customers: true } } },
    }),
    // The company-admin account created with the tenant — the human the platform actually contacts.
    prisma.user.findFirst({
      where: { companyId, userType: "COMPANY_USER", role: { isSystem: true } },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.billingLedgerEntry.aggregate({
      _sum: { cartonCount: true },
      where: { companyId, entryType: "CARTON_FEE", createdAt: { gte: start, lt: end } },
    }),
    prisma.shipment.count({ where: { companyId, createdAt: { gte: start, lt: end } } }),
    prisma.trip.count({ where: { companyId, createdAt: { gte: start, lt: end } } }),
  ]);

  if (!company) return null;
  return {
    ...company,
    owner,
    monthly: { cartons: cartons._sum.cartonCount ?? 0, shipments, trips },
  };
}

export async function createCompany(params: { name: string; slug: string; phone?: string; email?: string; adminName: string; adminEmail: string; adminPassword: string }) {
  const company = await prisma.company.create({
    data: { name: params.name, slug: params.slug, phone: params.phone, email: params.email },
  });

  const adminRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: "مدير الشركة",
      description: "صلاحية كاملة على الشركة",
      permissions: JSON.stringify(FULL_PERMISSIONS),
      isSystem: true,
    },
  });

  const passwordHash = await bcrypt.hash(params.adminPassword, 10);
  await prisma.user.create({
    data: {
      companyId: company.id,
      name: params.adminName,
      email: params.adminEmail,
      passwordHash,
      userType: "COMPANY_USER",
      roleId: adminRole.id,
    },
  });

  return company;
}

export async function setCompanyStatus(companyId: string, status: "ACTIVE" | "SUSPENDED") {
  return prisma.company.update({ where: { id: companyId }, data: { status } });
}

export type CompanyPeriod = "all" | "30d" | "90d" | "year";

function periodStart(period: CompanyPeriod): Date | undefined {
  const now = new Date();
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return undefined;
}

function companyWhere(params: { search?: string; status?: string; period?: CompanyPeriod }) {
  const since = periodStart(params.period ?? "all");
  return {
    ...(params.search
      ? { OR: [{ name: { contains: params.search, mode: "insensitive" as const } }, { slug: { contains: params.search, mode: "insensitive" as const } }] }
      : {}),
    ...(params.status === "ACTIVE" || params.status === "SUSPENDED" ? { status: params.status } : {}),
    ...(since ? { createdAt: { gte: since } } : {}),
  };
}

/**
 * Per-company figures for the platform companies table, aggregated only for the ids on the current
 * page so the query cost doesn't grow with the tenant count.
 *
 * - cartonsThisMonth / outstanding come from the carton-fee ledger, which already carries companyId
 *   (Carton itself only links to a shipment). Settlements are stored as negative amounts, so the
 *   plain SUM over every entry is the net receivable.
 * - lastActivity is the most recent shipment the company created.
 */
async function companyMetrics(ids: string[]) {
  if (ids.length === 0) return new Map<string, { cartonsThisMonth: number; outstanding: number; lastActivity: Date | null }>();
  const { start, end } = monthRange(new Date());

  const [monthly, balances, activity] = await Promise.all([
    prisma.billingLedgerEntry.groupBy({
      by: ["companyId"],
      _sum: { cartonCount: true },
      where: { companyId: { in: ids }, entryType: "CARTON_FEE", createdAt: { gte: start, lt: end } },
    }),
    prisma.billingLedgerEntry.groupBy({ by: ["companyId"], _sum: { amount: true }, where: { companyId: { in: ids } } }),
    prisma.shipment.groupBy({ by: ["companyId"], _max: { createdAt: true }, where: { companyId: { in: ids } } }),
  ]);

  const map = new Map(ids.map((id) => ({ id, v: { cartonsThisMonth: 0, outstanding: 0, lastActivity: null as Date | null } })).map((e) => [e.id, e.v]));
  for (const row of monthly) map.get(row.companyId)!.cartonsThisMonth = row._sum.cartonCount ?? 0;
  for (const row of balances) map.get(row.companyId)!.outstanding = Number(row._sum.amount ?? 0);
  for (const row of activity) map.get(row.companyId)!.lastActivity = row._max.createdAt;
  return map;
}

/** Paginated, filtered company list for /platform/companies. */
export async function listPlatformCompanies(params: {
  search?: string;
  status?: string;
  period?: CompanyPeriod;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = Math.min(Math.max(params.pageSize ?? 10, 1), 100);
  const page = Math.max(params.page ?? 1, 1);
  const where = companyWhere(params);

  const [total, rows] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, slug: true, status: true, createdAt: true, logoColor: true },
    }),
  ]);

  const metrics = await companyMetrics(rows.map((r) => r.id));
  const items = rows.map((r) => ({ ...r, ...metrics.get(r.id)! }));

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Chip counts above the table. Only the statuses the schema actually has. */
export async function platformCompanyCounts() {
  const [total, active, suspended] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.company.count({ where: { status: "SUSPENDED" } }),
  ]);
  return { total, active, suspended };
}

/** Unpaginated rows for CSV export — same filters as the table. */
export async function listPlatformCompaniesForExport(params: { search?: string; status?: string; period?: CompanyPeriod }) {
  const rows = await prisma.company.findMany({
    where: companyWhere(params),
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, slug: true, status: true, createdAt: true },
  });
  const metrics = await companyMetrics(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...metrics.get(r.id)! }));
}

/** Inclusive-start, exclusive-end bounds for the calendar month containing `ref`. */
function monthRange(ref: Date) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  return { start, end };
}

/** null when the previous value is 0 — "+100%" off a zero base is noise, not signal. */
function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Everything the platform dashboard shows, for one calendar month.
 *
 * Deliberately built only from fields that exist: revenue comes from the carton-fee ledger (the
 * usage-based 5-YER/carton model), and company status is the real ACTIVE/SUSPENDED pair. There is
 * no trial or expiry concept in the schema — and none in the pricing model — so no such buckets
 * are reported here rather than being faked.
 */
export async function platformDashboard(month: Date = new Date()) {
  const { start, end } = monthRange(month);
  const prev = monthRange(new Date(month.getFullYear(), month.getMonth() - 1, 1));
  // Dormancy is live state, not a property of the selected month: measuring it from `end` would ask
  // "no shipments in the 7 days before the month ended", which is a future window for the current
  // month and reports every company as dormant.
  const inactiveSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    cartonsThisMonth,
    cartonsPrevMonth,
    revenueThisMonth,
    revenuePrevMonth,
    unpaidInvoices,
    activeCompanyIds,
    recentlyActiveIds,
    dailyCartons,
    dailyPrevCartons,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { status: "ACTIVE" } }),
    prisma.company.count({ where: { status: "SUSPENDED" } }),
    prisma.carton.count({ where: { createdAt: { gte: start, lt: end } } }),
    prisma.carton.count({ where: { createdAt: { gte: prev.start, lt: prev.end } } }),
    prisma.billingLedgerEntry.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: start, lt: end } } }),
    prisma.billingLedgerEntry.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: prev.start, lt: prev.end } } }),
    prisma.invoice.count({ where: { status: "UNPAID" } }),
    prisma.company.findMany({ where: { status: "ACTIVE" }, select: { id: true } }),
    prisma.shipment.findMany({
      where: { createdAt: { gte: inactiveSince } },
      select: { companyId: true },
      distinct: ["companyId"],
    }),
    prisma.carton.findMany({ where: { createdAt: { gte: start, lt: end } }, select: { createdAt: true } }),
    prisma.carton.findMany({ where: { createdAt: { gte: prev.start, lt: prev.end } }, select: { createdAt: true } }),
  ]);

  const revenue = Number(revenueThisMonth._sum.amount ?? 0);
  const prevRevenue = Number(revenuePrevMonth._sum.amount ?? 0);

  const recentlyActive = new Set(recentlyActiveIds.map((s) => s.companyId));
  const dormantCompanies = activeCompanyIds.filter((c) => !recentlyActive.has(c.id)).length;

  // Bucket into day-of-month slots so both months can be overlaid on one axis.
  const daysInMonth = new Date(end.getTime() - 1).getDate();
  const series = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, current: 0, previous: 0 }));
  for (const c of dailyCartons) {
    const slot = series[c.createdAt.getDate() - 1];
    if (slot) slot.current += 1;
  }
  for (const c of dailyPrevCartons) {
    const slot = series[c.createdAt.getDate() - 1];
    if (slot) slot.previous += 1;
  }

  return {
    month: start,
    totalCompanies,
    activeCompanies,
    suspendedCompanies,
    activeShare: totalCompanies === 0 ? 0 : Math.round((activeCompanies / totalCompanies) * 100),
    cartonsThisMonth,
    cartonsChange: percentChange(cartonsThisMonth, cartonsPrevMonth),
    revenue,
    revenueChange: percentChange(revenue, prevRevenue),
    unpaidInvoices,
    dormantCompanies,
    series,
  };
}

export async function platformOverview() {
  const [companies, shipments, trips, customers, deliveryRequests] = await Promise.all([
    prisma.company.count(),
    prisma.shipment.count(),
    prisma.trip.count(),
    prisma.customer.count(),
    prisma.deliveryRequest.count(),
  ]);
  const shipmentsByStatus = await prisma.shipment.groupBy({ by: ["status"], _count: true });
  return { companies, shipments, trips, customers, deliveryRequests, shipmentsByStatus };
}
