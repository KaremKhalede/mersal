import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/enums";

export default async function PlatformDeliveryPage() {
  await requirePlatformAdmin();
  const requests = await prisma.deliveryRequest.findMany({
    include: { company: true, shipment: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">طلبات التوصيل (أرشي) — {requests.length}</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الشحنة</TableHead>
                <TableHead>الشركة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>المرجع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.shipment.shipmentNumber}</TableCell>
                  <TableCell>{r.company.name}</TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell><Badge variant="outline">{DELIVERY_STATUS_LABELS[r.status as DeliveryStatus] ?? r.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground" dir="ltr">{r.providerRef}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
