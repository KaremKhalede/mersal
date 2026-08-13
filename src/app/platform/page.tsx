import { requirePlatformAdmin } from "@/lib/auth";
import { platformOverview } from "@/modules/companies/service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Package, Truck, Contact, Send } from "lucide-react";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function PlatformDashboardPage() {
  await requirePlatformAdmin();
  const data = await platformOverview();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="الشركات" value={data.companies} icon={Building2} />
        <StatCard label="إجمالي الشحنات" value={data.shipments} icon={Package} />
        <StatCard label="الرحلات" value={data.trips} icon={Truck} tone="warning" />
        <StatCard label="العملاء" value={data.customers} icon={Contact} />
        <StatCard label="طلبات التوصيل" value={data.deliveryRequests} icon={Send} tone="success" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">الشحنات حسب الحالة (عبر جميع الشركات)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {data.shipmentsByStatus.sort((a, b) => b._count - a._count).map((row) => (
            <div key={row.status} className="rounded-lg border p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{SHIPMENT_STATUS_LABELS[row.status as ShipmentStatus] ?? row.status}</span>
              <span className="font-bold">{row._count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
