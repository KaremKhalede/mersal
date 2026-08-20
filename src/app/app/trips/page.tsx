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
import { ArrowLeft } from "lucide-react";
import { formatBusinessDateTime } from "@/lib/timezone";
import { TRIP_STATUSES, TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";

const STATUS_STYLES: Record<TripStatus, string> = {
  PLANNED: "border-muted-foreground/30 bg-muted text-foreground",
  IN_PROGRESS: "border-primary/30 bg-primary/10 text-primary",
  COMPLETED: "border-success/30 bg-success/15 text-success",
  CANCELLED: "bg-muted text-muted-foreground",
};

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">الرحلات ({total})</h2>
        <NewTripButton />
      </div>

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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الرحلة</TableHead>
                  <TableHead>المسار</TableHead>
                  <TableHead>الحمولة</TableHead>
                  <TableHead>السائق</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/app/trips/${t.id}`} className="font-medium text-primary hover:underline">{t.tripNumber}</Link>
                      {t.vehicle && <p className="text-xs text-muted-foreground" dir="ltr">{t.vehicle.plateNumber}</p>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="flex items-center gap-1 flex-wrap">
                        {t.stops.map((s, i) => (
                          <span key={s.id} className="flex items-center gap-1">
                            {s.branch.name}
                            {i < t.stops.length - 1 && <ArrowLeft className="h-3 w-3" />}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {t.shipmentCount > 0 ? `${t.shipmentCount} شحنة / ${t.cartonCount} كرتون` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{t.driver?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatBusinessDateTime(t.createdAt, { day: "numeric", month: "numeric", year: "numeric" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_STYLES[t.status as TripStatus]}>
                        {TRIP_STATUS_LABELS[t.status as TripStatus] ?? t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {trips.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {status ? "لا توجد رحلات بهذه الحالة" : "لا توجد رحلات"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
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
