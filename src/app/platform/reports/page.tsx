import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function PlatformReportsPage() {
  await requirePlatformAdmin();

  const byStatus = await prisma.shipment.groupBy({ by: ["status"], _count: true });
  const byCompany = await prisma.shipment.groupBy({ by: ["companyId"], _count: true });
  const companies = await prisma.company.findMany({ where: { id: { in: byCompany.map((c) => c.companyId) } } });
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">التقارير العامة</h2>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">الشحنات حسب الحالة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {byStatus.sort((a, b) => b._count - a._count).map((row) => (
              <div key={row.status} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{SHIPMENT_STATUS_LABELS[row.status as ShipmentStatus] ?? row.status}</span>
                <span className="font-semibold">{row._count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">الشحنات حسب الشركة</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {byCompany.sort((a, b) => b._count - a._count).map((row) => (
              <div key={row.companyId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{companyMap.get(row.companyId)}</span>
                <span className="font-semibold">{row._count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
