import { requireCompanyUser } from "@/lib/auth";
import { companyDashboard } from "@/modules/reports/service";
import { financeSummary, getCurrentPlatformFee } from "@/modules/billing/service";
import { collectedOnDay, businessToday } from "@/modules/collections/service";
import { getBranchScope } from "@/lib/branch-scope";
import { can } from "@/lib/rbac";
import { StatCard } from "@/components/ui/stat-card";
import { ShipmentStatusBadge, StopTimingBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Truck, CheckCircle2, AlertTriangle, MapPin, Wallet, Package, PackageCheck, ArrowLeft, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn, routeLabel } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale/ar";
import { formatBusinessDateTime } from "@/lib/timezone";
import type { ShipmentStatus } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";
import { formatYER } from "@/lib/money";

type DashboardData = Awaited<ReturnType<typeof companyDashboard>>;
type DashboardTrip = DashboardData["activeTripsList"][number];
type DashboardActivity = DashboardData["recentActivity"][number];

const ACTIVITY_ICON: Partial<Record<ShipmentStatus, { icon: LucideIcon; tone: keyof typeof TONE_CLASSES }>> = {
  RECEIVED: { icon: PackageCheck, tone: "success" },
  LOADED: { icon: Truck, tone: "primary" },
  IN_TRANSIT: { icon: Truck, tone: "primary" },
  AT_INTERMEDIATE_STOP: { icon: MapPin, tone: "warning" },
  ARRIVED: { icon: MapPin, tone: "warning" },
  PARTIALLY_ARRIVED: { icon: MapPin, tone: "warning" },
  DELIVERED: { icon: CheckCircle2, tone: "success" },
  READY_FOR_PICKUP: { icon: CheckCircle2, tone: "success" },
  EXCEPTION: { icon: AlertTriangle, tone: "destructive" },
};
const TONE_CLASSES = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export default async function CompanyDashboardPage() {
  const user = await requireCompanyUser();
  const canSeeFinance = can(user, "billing", "view");
  const canSeeActivity = can(user, "reports", "view");
  const canSeeExceptions = can(user, "shipments", "updateStatus");
  const branchScope = getBranchScope(user);
  const today = businessToday();
  const [data, finance, feePerCarton, collectedToday] = await Promise.all([
    companyDashboard(user.companyId!, branchScope),
    canSeeFinance ? financeSummary(user.companyId!, branchScope) : Promise.resolve(null),
    canSeeFinance ? getCurrentPlatformFee() : Promise.resolve(null),
    // Not part of financeSummary any more: that version summed a cumulative column and counted
    // every earlier instalment again on each day a shipment was touched. One definition of
    // "collected" now, shared with the daily close sheet this figure links to.
    canSeeFinance ? collectedOnDay(user.companyId!, today, { branchScope }) : Promise.resolve(0),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="لوحة التحكم" description="ما يحتاج متابعتك اليوم" />

      {/* Exceptions no longer get a permanent sidebar page — just this counter when there's
          something open, linking to the (still-existing, just no longer primary-nav) list. */}
      {data.exceptions > 0 && canSeeExceptions && (
        <Link
          href="/app/exceptions"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {data.exceptions} {data.exceptions === 1 ? "شحنة تحتاج متابعة" : "شحنات تحتاج متابعة"}
          <ArrowLeft className="h-3.5 w-3.5 ms-auto" />
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="في الطريق الآن" value={data.inTransit} icon={Truck} tone="warning"
          href="/app/shipments?status=IN_TRANSIT" linkLabel="عرض التفاصيل"
        />
        {/* "بانتظار التحميل" replaced a plain "إجمالي الشحنات" counter: a lifetime total is a number
            to look at, not a number to act on. This one is the loading queue — the question a
            shipping-office employee actually opens the dashboard to answer. */}
        <StatCard
          label="بانتظار التحميل" value={data.readyForLoading} icon={PackageCheck}
          href="/app/shipments?status=READY_FOR_LOADING" linkLabel="عرض الشحنات"
        />
        <StatCard label="رحلات نشطة" value={data.activeTrips} icon={Truck} href="/app/trips" linkLabel="عرض الرحلات" />
        <StatCard
          label="تم التسليم اليوم" value={data.deliveredToday} icon={CheckCircle2} tone="success"
          href="/app/shipments?status=DELIVERED" linkLabel="عرض التفاصيل"
        />
      </div>

      {finance && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" /> ملخص مالي
            </CardTitle>
            <Link href="/app/billing" className="text-xs text-primary hover:underline">التفاصيل والفواتير</Link>
          </CardHeader>
          {/* All three figures are now doors, not decorations. A number a manager cannot open is a
              number to look at rather than act on — the principle this dashboard already applied to
              its status counters, applied here too now that each figure finally has somewhere to
              lead. Each lands on the finance tab that explains it, and the customer/platform
              separation survives the trip: two of these open المستحقات / إقفال اليوم, the third
              opens رسوم المنصة, and no destination mixes the two. */}
          <CardContent className="grid grid-cols-3 divide-x divide-x-reverse text-center">
            <Link href={`/app/billing?tab=close&date=${today}`} className="px-2 rounded-lg hover:bg-accent">
              <p className="text-lg font-bold text-success">{formatYER(collectedToday)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">المُحصّل اليوم</p>
              <p className="text-2xs text-muted-foreground/70 mt-0.5">من قبض اليوم؟</p>
            </Link>
            {/* The figure used to be a dead end: it said how much is owed and offered no way to
                find out by whom. It now opens the receivables tab, which groups the same population
                by customer — same predicate on both sides (UNPAID_WHERE in modules/shipments), so
                the screen this opens always adds up to the number that opened it. */}
            <Link href="/app/billing?tab=receivables" className="px-2 rounded-lg hover:bg-accent">
              <p className="text-lg font-bold text-warning">{formatYER(finance.outstanding)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">المتبقي على العملاء</p>
              <p className="text-2xs text-muted-foreground/70 mt-0.5">من عليه؟</p>
            </Link>
            <Link href="/app/billing?tab=platform" className="px-2 rounded-lg hover:bg-accent">
              <p className="text-lg font-bold">{formatYER(finance.platformFeesMTD)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">رسوم المنصة (هذا الشهر)</p>
              {feePerCarton != null && (
                <p className="text-2xs text-muted-foreground/70 mt-0.5">
                  {finance.cartonsMTD.toLocaleString()} كرتون × {formatYER(feePerCarton)}
                </p>
              )}
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> الرحلات النشطة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.activeTripsList.map((t) => (
              <TripRow key={t.id} trip={t} />
            ))}
            {data.activeTripsList.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">لا توجد رحلات نشطة الآن</p>
            )}
            {data.activeTripsList.length > 0 && (
              <Link href="/app/trips" className="flex items-center gap-1 pt-1 text-xs text-primary hover:underline w-fit">
                عرض كل الرحلات <ArrowLeft className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">أحدث النشاط</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentActivity.map((ev) => (
              <ActivityRow key={ev.id} event={ev} />
            ))}
            {data.recentActivity.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">لا يوجد نشاط بعد</p>
            )}
            {data.recentActivity.length > 0 && canSeeActivity && (
              <Link href="/app/activity" className="flex items-center gap-1 pt-1 text-xs text-primary hover:underline w-fit">
                عرض كل النشاط <ArrowLeft className="h-3 w-3" />
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">أحدث الشحنات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشحنة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>من ← إلى</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>آخر تحديث</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/app/shipments/${s.id}`} className="font-medium text-primary hover:underline">
                      {s.shipmentNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{s.customer.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {routeLabel(s.loadBranch.city, s.unloadBranch.city)}
                  </TableCell>
                  <TableCell>
                    <ShipmentStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDistanceToNow(s.updatedAt, { addSuffix: true, locale: ar })}
                  </TableCell>
                </TableRow>
              ))}
              {data.recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    لا توجد شحنات بعد
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function TripRow({ trip }: { trip: DashboardTrip }) {
  const stop = trip.currentStop;
  const isLate = trip.timing === "LATE";
  const relative = stop?.plannedArrival
    ? formatDistanceToNow(stop.plannedArrival, { addSuffix: true, locale: ar })
    : null;
  const atStop = stop && stop.status !== "PENDING";

  return (
    <Link
      href={`/app/trips/${trip.id}`}
      className="block rounded-lg border p-3 text-sm hover:bg-accent"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="font-medium">
          {trip.tripNumber} <span className="text-muted-foreground font-normal">· {trip.stops.map((s) => s.branch.city).join(" ← ")}</span>
        </p>
        {isLate ? (
          <StopTimingBadge timing="LATE" />
        ) : (
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">في الطريق</Badge>
        )}
      </div>
      {stop && relative && (
        <p className={cn("mt-1 flex items-center gap-1 text-xs", isLate ? "text-destructive" : "text-muted-foreground")}>
          {isLate && <AlertTriangle className="h-3 w-3 shrink-0" />}
          {atStop ? `في ${stop.branch.city} الآن` : `وصول إلى ${stop.branch.city} ${relative}`}
        </p>
      )}
      {/* "من يقود أي رحلة" — the manager's first question about a live trip, and Trip.driverId has
          always known the answer. */}
      <p className="mt-1 text-xs text-muted-foreground">
        {trip.shipmentCount} شحنة / {trip.cartonCount} كرتون
        {trip.driver ? <> · {trip.driver.name}</> : <span className="text-warning"> · بلا سائق</span>}
      </p>
    </Link>
  );
}

function ActivityRow({ event }: { event: DashboardActivity }) {
  const { icon: Icon, tone } = ACTIVITY_ICON[event.eventType as ShipmentStatus] ?? { icon: Package, tone: "primary" as const };
  return (
    <div className="flex items-start gap-3">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          {event.title}{" "}
          {event.shipment && (
            <Link href={`/app/shipments/${event.shipmentId}`} className="font-medium text-primary hover:underline" dir="ltr">
              {event.shipment.shipmentNumber}
            </Link>
          )}
          {event.shipment && <span className="text-muted-foreground"> من {event.shipment.customer.name}</span>}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
        {formatBusinessDateTime(event.createdAt, { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
