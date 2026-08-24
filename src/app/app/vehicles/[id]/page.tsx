import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getVehicleDetail } from "@/modules/vehicles/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Truck, Route } from "lucide-react";
import { VEHICLE_TYPE_LABELS, TRIP_STATUS_LABELS, type VehicleType, type TripStatus } from "@/lib/enums";
import { formatDate } from "@/lib/timezone";
import { PageHeader } from "@/components/shell/page-header";
import { routeLabel } from "@/lib/utils";

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "vehicles", "view");
  const { id } = await params;
  const vehicle = await getVehicleDetail(user.companyId!, id);
  if (!vehicle) notFound();

  const lastTrip = vehicle.trips[0];

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={vehicle.plateNumber}
        description={VEHICLE_TYPE_LABELS[vehicle.type as VehicleType] ?? vehicle.type ?? "—"}
        badge={<ActiveBadge active={vehicle.isActive} activeLabel="نشطة" inactiveLabel="غير نشطة" />}
        parent={{ label: "المركبات", href: "/app/vehicles" }}
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><Truck className="h-4 w-4" /> معلومات المركبة</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="رقم اللوحة" value={<span dir="ltr">{vehicle.plateNumber}</span>} />
          <Field label="النوع" value={VEHICLE_TYPE_LABELS[vehicle.type as VehicleType] ?? vehicle.type ?? "—"} />
          <Field label="عدد الرحلات" value={vehicle._count.trips} />
          <Field
            label="آخر رحلة"
            value={
              lastTrip ? (
                <Link href={`/app/trips/${lastTrip.id}`} className="text-primary hover:underline">{lastTrip.tripNumber}</Link>
              ) : (
                "لا توجد رحلات بعد"
              )
            }
          />
          {lastTrip && <Field label="تاريخ آخر رحلة" value={formatDate(lastTrip.createdAt)} />}
          {lastTrip?.driver && <Field label="سائق آخر رحلة" value={lastTrip.driver.name} />}
          <div className="sm:col-span-2">
            <Field label="ملاحظات" value={vehicle.notes || "—"} />
          </div>
        </CardContent>
      </Card>

      {vehicle.trips.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><Route className="h-4 w-4" /> آخر الرحلات</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {vehicle.trips.map((t) => {
              const route = t.stops.length > 1 ? routeLabel(t.stops[0].branch.name, t.stops[t.stops.length - 1].branch.name) : t.stops[0]?.branch.name;
              return (
                <Link
                  key={t.id}
                  href={`/app/trips/${t.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-primary">{t.tripNumber}</span>
                    {route && <span className="text-muted-foreground">{route}</span>}
                    {t.driver && <span className="text-muted-foreground">— {t.driver.name}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Badge variant="outline">{TRIP_STATUS_LABELS[t.status as TripStatus] ?? t.status}</Badge>
                    <span>{formatDate(t.createdAt)}</span>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
