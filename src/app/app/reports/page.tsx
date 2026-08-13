import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { companyDashboard, branchPerformance } from "@/modules/reports/service";
import { billingSummary } from "@/modules/billing/service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Boxes, Wallet, AlertTriangle } from "lucide-react";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function ReportsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "reports", "view");
  const [dashboard, branches, billing] = await Promise.all([
    companyDashboard(user.companyId!),
    branchPerformance(user.companyId!),
    billingSummary(user.companyId!),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">التقارير</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="إجمالي الشحنات" value={dashboard.total} icon={Package} />
        <StatCard label="إجمالي الكراتين" value={dashboard.cartons} icon={Boxes} />
        <StatCard label="إجمالي رسوم المنصة" value={`${billing.totalAmount.toLocaleString()} ر.ي`} icon={Wallet} tone="success" />
        <StatCard label="استثناءات" value={dashboard.exceptions} icon={AlertTriangle} tone="destructive" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">الشحنات حسب الحالة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dashboard.byStatus.sort((a, b) => b._count - a._count).map((row) => (
              <div key={row.status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{SHIPMENT_STATUS_LABELS[row.status as ShipmentStatus] ?? row.status}</span>
                <span className="font-semibold">{row._count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">أداء الفروع</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفرع</TableHead>
                  <TableHead>شحنات محمّلة منه</TableHead>
                  <TableHead>شحنات مفرّغة فيه</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.branch.id}>
                    <TableCell className="font-medium">{b.branch.name}</TableCell>
                    <TableCell>{b.loaded}</TableCell>
                    <TableCell>{b.unloaded}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
