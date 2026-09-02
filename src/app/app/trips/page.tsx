import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listTrips } from "@/modules/trips/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import Link from "next/link";
import { NewTripButton } from "./new-trip-button";
import { ArrowLeft, Truck } from "lucide-react";
import { TRIP_STATUSES, TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, NoResults } from "@/components/feedback/empty-state";

const STATUS_STYLES: Record<TripStatus, string> = {
  PLANNED: "border-muted-foreground/30 bg-muted text-foreground",
  IN_PROGRESS: "border-primary/30 bg-primary/10 text-primary",
  COMPLETED: "border-success/30 bg-success/15 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
};

/**
 * Where the truck actually is, in one cell.
 *
 * A trip that has not started reads as its first stop; one under way reads as the earliest stop it
 * has not left yet; a finished one reads as its destination. Same "first stop not yet departed"
 * rule the driver app, the trip page and the dashboard all use, so no two screens can disagree
 * about where a trip has got to.
 */
function tripLocation(trip: { status: string; stops: { status: string; branch: { name: string } }[] }): string {
  if (trip.stops.length === 0) return "—";
  if (trip.status === "COMPLETED") return trip.stops[trip.stops.length - 1].branch.name;
  const current = trip.stops.find((s) => s.status !== "DEPARTED" && s.status !== "DONE");
  return (current ?? trip.stops[trip.stops.length - 1]).branch.name;
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "view");
  const sp = await searchParams;
  const page = Number(sp.page || 1);
  const status = TRIP_STATUSES.includes(sp.status as TripStatus) ? (sp.status as TripStatus) : undefined;
  const { items: trips, total, pageCount } = await listTrips(user.companyId!, getBranchScope(user), page, 20, status);

  return (
    <div className="space-y-4">
      <PageHeader title="الرحلات" count={total} actions={<NewTripButton />} />

      {/* One filter only. "Which trips are still moving" is a different daily question from the
          historical log, and mixing both into one 20-row page is what made this list hard to read. */}
      <form className="flex flex-wrap items-center gap-2">
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">كل الحالات</option>
          {TRIP_STATUSES.map((s) => (
            <option key={s} value={s}>{TRIP_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">تصفية</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {trips.length === 0 ? (
            status ? (
              <NoResults resetHref="/app/trips" label="لا توجد رحلات بهذه الحالة" />
            ) : (
              <EmptyState
                icon={Truck}
                title="لا توجد رحلات بعد"
                description="أنشئ رحلة، حدّد محطاتها، ثم اربط بها الشحنات الجاهزة للتحميل."
                action={<NewTripButton />}
              />
            )
          ) : (
            <>
              {/* Below lg for the same reason as the shipments list — see the note there. */}
              <ul className="divide-y lg:hidden">
                {trips.map((t) => (
                  <li key={t.id}>
                    <Link href={`/app/trips/${t.id}`} className="block space-y-1 p-3 hover:bg-accent">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-primary">{t.tripNumber}</span>
                        <Badge variant="outline" className={STATUS_STYLES[t.status as TripStatus]}>
                          {TRIP_STATUS_LABELS[t.status as TripStatus] ?? t.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{t.stops.map((st) => st.branch.name).join(" ← ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.shipmentCount > 0 ? `${t.shipmentCount} شحنة / ${t.cartonCount} كرتون` : "لا حمولة بعد"}
                        {t.driver ? ` · ${t.driver.name}` : ""}
                        {t.vehicle ? ` · ` : ""}
                        {t.vehicle && <span dir="ltr">{t.vehicle.plateNumber}</span>}
                      </p>
                      {/* A trip nobody is driving cannot be executed at all — the driver app
                          resolves its trip by Trip.driverId — so it is stated, not left to be
                          noticed by an empty cell. Only while it still matters: a finished or
                          cancelled trip has nothing left to assign. */}
                      {!t.driverId && t.status !== "COMPLETED" && t.status !== "CANCELLED" && (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">بلا سائق</Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الرحلة</TableHead>
                      <TableHead>المركبة</TableHead>
                      <TableHead>المسار</TableHead>
                      <TableHead>الحمولة</TableHead>
                      <TableHead>السائق</TableHead>
                      {/* "تاريخ الإنشاء" was here, and nobody has ever needed to know when a trip
                          row was typed in. What the column is actually asked is where the truck is
                          now, which the stops already know — so it states that instead. */}
                      <TableHead>الموقع</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.map((t) => (
                      <TableRow key={t.id} className="relative">
                        <TableCell>
                          <Link
                            href={`/app/trips/${t.id}`}
                            className="font-medium text-primary hover:underline after:absolute after:inset-0"
                          >
                            {t.tripNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.vehicle ? <span dir="ltr">{t.vehicle.plateNumber}</span> : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-1 flex-wrap">
                            {t.stops.map((st, i) => (
                              <span key={st.id} className="flex items-center gap-1">
                                {st.branch.name}
                                {i < t.stops.length - 1 && <ArrowLeft className="h-3 w-3" />}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {t.shipmentCount > 0 ? `${t.shipmentCount} شحنة / ${t.cartonCount} كرتون` : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {/* The driver's name was plain text on every row of this list, so
                              "how much has أحمد been running" had no answer despite Trip.driverId
                              existing since day one. `relative z-10` keeps it clickable above the
                              row's own stretched link. */}
                          {t.driver ? (
                            <Link href={`/app/employees/${t.driverId}`} className="relative z-10 text-primary hover:underline">
                              {t.driver.name}
                            </Link>
                          ) : t.status === "COMPLETED" || t.status === "CANCELLED" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            // Not an em dash: an unassigned live trip is a job waiting for someone,
                            // and it is the one thing on this row worth acting on.
                            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">بلا سائق</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {tripLocation(t)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[t.status as TripStatus]}>
                            {TRIP_STATUS_LABELS[t.status as TripStatus] ?? t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemsShown={trips.length}
        itemLabel="رحلة"
        buildHref={(p) => `/app/trips?page=${p}${status ? `&status=${status}` : ""}`}
      />
    </div>
  );
}
