import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { listDeliveryRequests } from "@/modules/delivery/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { DeliveryQueueActions } from "./delivery-queue-actions";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/enums";

export default async function DeliveryRequestsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const requests = await listDeliveryRequests(user.companyId!, getBranchScope(user));
  const canAct = can(user, "shipments", "updateStatus");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">طلبات التوصيل</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الشحنة</TableHead>
                {/* The delivery contact — the receiver, not the sender. See DeliveryRequest in
                    prisma/schema.prisma for why these columns are named customerName/customerPhone. */}
                <TableHead>المستلم</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>المرجع</TableHead>
                {canAct && <TableHead>الإجراء</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell><Link href={`/app/shipments/${r.shipmentId}`} className="text-primary hover:underline">{r.shipment.shipmentNumber}</Link></TableCell>
                  <TableCell>
                    {r.customerName}
                    <span className="block text-xs text-muted-foreground" dir="ltr">{r.customerPhone}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.destinationAddress}</TableCell>
                  <TableCell>{r.cartonCount}</TableCell>
                  <TableCell><Badge variant="outline">{DELIVERY_STATUS_LABELS[r.status as DeliveryStatus] ?? r.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-xs" dir="ltr">{r.providerRef}</TableCell>
                  {canAct && (
                    <TableCell>
                      <DeliveryQueueActions requestId={r.id} shipmentId={r.shipmentId} status={r.status} receiverName={r.shipment.receiverName} missingCartonCodes={r.shipment.cartons.filter((c) => c.status === "MISSING").map((c) => c.cartonCode)} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {requests.length === 0 && <TableRow><TableCell colSpan={canAct ? 7 : 6} className="text-center text-muted-foreground py-8">لا توجد طلبات توصيل</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
