import { notFound } from "next/navigation";
import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getEmployeeDetail } from "@/modules/users/service";
import { listTripsForDriver } from "@/modules/trips/service";
import { can } from "@/lib/rbac";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";
import { getBranchScope } from "@/lib/branch-scope";
import { formatDate } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ui/status-badge";
import { UserRound, Mail, Phone, Shield, Building2, KeyRound, Truck, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "employees", "view");
  const { id } = await params;
  const employee = await getEmployeeDetail(user.companyId!, id, getBranchScope(user));
  if (!employee) notFound();

  // Only for drivers, and only for a role allowed to see trips at all. A non-driver employee has
  // no Trip.driverId rows by construction, so the query would be a guaranteed-empty read.
  const driverTrips =
    employee.userType === "DRIVER" && can(user, "trips", "view")
      ? await listTripsForDriver(user.companyId!, employee.id)
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={employee.name}
        description={employee.role?.name ?? (employee.userType === "DRIVER" ? "سائق" : "—")}
        badge={<ActiveBadge active={employee.status === "ACTIVE"} />}
        parent={{ label: "الموظفون", href: "/app/employees" }}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><UserRound className="h-4 w-4" /> معلومات الموظف</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="الاسم الكامل" value={employee.name} />
          <Field label={<span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> البريد الإلكتروني</span>} value={<span dir="ltr">{employee.email}</span>} />
          <Field label={<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> رقم الجوال</span>} value={<span dir="ltr">{formatPhoneDisplay(employee.phone)}</span>} />
          <Field label={<span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> الدور الوظيفي</span>} value={employee.role?.name ?? (employee.userType === "DRIVER" ? "سائق" : "—")} />
          <Field label={<span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> الفرع</span>} value={employee.branch?.name ?? "بدون فرع محدد"} />
          <Field label="رقم الموظف" value={<span dir="ltr">{employee.employeeCode ?? "—"}</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><KeyRound className="h-4 w-4" /> معلومات الوصول</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="حالة الحساب" value={<ActiveBadge active={employee.status === "ACTIVE"} />} />
          <Field label="تاريخ الإنشاء" value={formatDate(employee.createdAt)} />
        </CardContent>
      </Card>

      {/*
        The other half of the Trip.driverId relation — the half nobody could follow.

        "كم رحلة قاد أحمد هذا الشهر" is a question a manager asks out loud, and the data has always
        been there; the product simply never let anyone cross from a driver to their work. The trip
        list now links here, and this links back.

        Capped at ten, with the true total stated. A driver's page is not a second trips list with
        its own filters and pages — someone who needs the full history is on /app/trips.
      */}
      {driverTrips && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-base">
              <Truck className="h-4 w-4" /> رحلات السائق
              {driverTrips.total > 0 && (
                <span className="font-normal text-muted-foreground">({driverTrips.total.toLocaleString("en-US")})</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {driverTrips.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">لم تُسنَد إليه أي رحلة بعد</p>
            ) : (
              <ul className="divide-y">
                {driverTrips.items.map((trip) => (
                  <li key={trip.id}>
                    <Link href={`/app/trips/${trip.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm hover:bg-accent">
                      <span className="font-medium text-primary" dir="ltr">{trip.tripNumber}</span>
                      <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status as TripStatus] ?? trip.status}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {trip.stops.map((s) => s.branch.name).join(" ← ")}
                      </span>
                      <span className="ms-auto text-xs text-muted-foreground whitespace-nowrap">
                        {trip.shipmentCount > 0 ? `${trip.shipmentCount} شحنة · ${trip.cartonCount} كرتون` : "لا حمولة"}
                        {trip.vehicle ? ` · ${trip.vehicle.plateNumber}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {driverTrips.total > driverTrips.items.length && (
              <div className="border-t p-2 text-center">
                <Link href="/app/trips" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  عرض كل الرحلات <ArrowLeft className="h-3 w-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
