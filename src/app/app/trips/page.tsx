import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listTrips } from "@/modules/trips/service";
import { listBranches } from "@/modules/branches/service";
import { listDrivers } from "@/modules/users/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { NewTripDialog } from "./new-trip-dialog";
import { ArrowLeft } from "lucide-react";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "view");
  const sp = await searchParams;
  const page = Number(sp.page || 1);
  const [{ items: trips, pageCount }, branches, drivers] = await Promise.all([
    listTrips(user.companyId!, getBranchScope(user), page),
    listBranches(user.companyId!),
    listDrivers(user.companyId!),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الرحلات</h2>
        <NewTripDialog branches={branches} drivers={drivers} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الرحلة</TableHead>
                <TableHead>المسار</TableHead>
                <TableHead>السائق</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((t) => (
                <TableRow key={t.id}>
                  <TableCell><Link href={`/app/trips/${t.id}`} className="font-medium text-primary hover:underline">{t.tripNumber}</Link></TableCell>
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
                  <TableCell>{t.driver?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{TRIP_STATUS_LABELS[t.status as TripStatus] ?? t.status}</Badge></TableCell>
                </TableRow>
              ))}
              {trips.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد رحلات</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={`/app/trips?page=${p}`}
              className={`h-8 w-8 flex items-center justify-center rounded-md border ${p === page ? "bg-primary text-primary-foreground" : ""}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
