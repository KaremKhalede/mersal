import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";

export default async function PlatformShipmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePlatformAdmin();
  const { q } = await searchParams;

  const shipments = await prisma.shipment.findMany({
    where: q ? { OR: [{ shipmentNumber: { contains: q } }, { receiverName: { contains: q } }] } : undefined,
    include: { company: true, customer: true, loadBranch: true, unloadBranch: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">جميع الشحنات ({shipments.length})</h2>
      <form className="max-w-xs">
        <input name="q" defaultValue={q} placeholder="ابحث برقم الشحنة..." className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
      </form>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشحنة</TableHead>
                <TableHead>الشركة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>المسار</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.shipmentNumber}</TableCell>
                  <TableCell>{s.company.name}</TableCell>
                  <TableCell>{s.customer.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.loadBranch.city} - {s.unloadBranch.city}</TableCell>
                  <TableCell>{s.arrivedCartons}/{s.totalCartons}</TableCell>
                  <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
