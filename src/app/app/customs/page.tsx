import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listCustomsCases } from "@/modules/customs/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { CUSTOMS_STATUS_LABELS, type CustomsStatus } from "@/lib/enums";

export default async function CustomsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "customs", "view");
  const cases = await listCustomsCases(user.companyId!, getBranchScope(user));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">الجمارك</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشحنة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>الحالة الجمركية</TableHead>
                <TableHead>ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Link href={`/app/shipments/${c.shipmentId}`} className="text-primary hover:underline">{c.shipment.shipmentNumber}</Link></TableCell>
                  <TableCell>{c.shipment.customer.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.status === "ON_HOLD" || c.status === "EXCEPTION" ? "border-destructive/30 bg-destructive/10 text-destructive" : ""}>
                      {CUSTOMS_STATUS_LABELS[c.status as CustomsStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
              {cases.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد ملفات جمركية</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
