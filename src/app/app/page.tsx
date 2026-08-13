import { requireCompanyUser } from "@/lib/auth";
import { companyDashboard } from "@/modules/reports/service";
import { financeSummary } from "@/modules/billing/service";
import { getBranchScope } from "@/lib/branch-scope";
import { can } from "@/lib/rbac";
import { StatCard } from "@/components/ui/stat-card";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Truck, CheckCircle2, AlertTriangle, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function CompanyDashboardPage() {
  const user = await requireCompanyUser();
  const canSeeFinance = can(user, "billing", "view");
  const [data, finance] = await Promise.all([
    companyDashboard(user.companyId!),
    canSeeFinance ? financeSummary(user.companyId!, getBranchScope(user)) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      {/* أسئلة تشغيلية سريعة: أين شحناتي الآن، ماذا يحتاج تدخلي، ماذا يحدث بالرحلات */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="في الطريق الآن" value={data.inTransit} icon={Truck} tone="warning" />
        <StatCard label="رحلات نشطة" value={data.activeTrips} icon={Truck} />
        <StatCard label="يحتاج إجراء" value={data.needsAction.length} icon={AlertTriangle} tone="destructive" />
        <StatCard label="تم التسليم" value={data.delivered} icon={CheckCircle2} tone="success" />
      </div>

      {finance && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" /> ملخص مالي
            </CardTitle>
            <Link href="/app/billing" className="text-xs text-primary hover:underline">التفاصيل والفواتير</Link>
          </CardHeader>
          <CardContent className="grid grid-cols-3 divide-x divide-x-reverse text-center">
            <div className="px-2">
              <p className="text-lg font-bold text-success">{finance.collectedToday.toLocaleString()} ر.ي</p>
              <p className="text-xs text-muted-foreground mt-0.5">المُحصّل اليوم</p>
            </div>
            <div className="px-2">
              <p className="text-lg font-bold text-warning">{finance.outstanding.toLocaleString()} ر.ي</p>
              <p className="text-xs text-muted-foreground mt-0.5">المتبقي على العملاء</p>
            </div>
            <div className="px-2">
              <p className="text-lg font-bold">{finance.platformFeesMTD.toLocaleString()} ر.ي</p>
              <p className="text-xs text-muted-foreground mt-0.5">رسوم المنصة (هذا الشهر)</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" /> يحتاج إجراء الآن
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الشحنة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.needsAction.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Link href={`/app/shipments/${s.id}`} className="font-medium text-primary hover:underline">
                        {s.shipmentNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{s.customer.name}</TableCell>
                    <TableCell><ShipmentStatusBadge status={s.status as ShipmentStatus} /></TableCell>
                  </TableRow>
                ))}
                {data.needsAction.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      لا شيء يحتاج إجراء حالياً
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> الرحلات النشطة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.activeTripsList.map((t) => (
              <Link
                key={t.id}
                href={`/app/trips/${t.id}`}
                className="flex items-center justify-between rounded-lg border p-2.5 text-sm hover:bg-accent"
              >
                <div>
                  <p className="font-medium">{t.tripNumber}</p>
                  <p className="text-muted-foreground text-xs">
                    {t.stops.map((s) => s.branch.city).join(" ← ")}
                    {t.driver && ` · ${t.driver.name}`}
                  </p>
                </div>
                <Badge variant="outline">{t.shipmentLinks.length} شحنة على متنها</Badge>
              </Link>
            ))}
            {data.activeTripsList.length === 0 && (
              <p className="text-center text-muted-foreground py-8 text-sm">لا توجد رحلات نشطة الآن</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">أحدث الشحنات</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الشحنة</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>من - إلى</TableHead>
                  <TableHead>الحالة</TableHead>
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
                      {s.loadBranch.city} - {s.unloadBranch.city}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {data.recent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      لا توجد شحنات بعد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">ماذا حدث اليوم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(data.todayActivity).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">لا نشاط اليوم بعد</p>
            )}
            {Object.entries(data.todayActivity)
              .sort(([, a], [, b]) => b - a)
              .map(([eventType, count]) => (
                <div key={eventType} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{SHIPMENT_STATUS_LABELS[eventType as ShipmentStatus] ?? eventType}</span>
                  <span className="font-semibold">{count}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
