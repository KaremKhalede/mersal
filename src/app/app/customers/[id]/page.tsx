import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getCustomerDetail } from "@/modules/customers/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "customers", "view");
  const { id } = await params;
  const customer = await getCustomerDetail(user.companyId!, id, getBranchScope(user));
  if (!customer) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">{customer.name}</h2>
        <p className="text-sm text-muted-foreground" dir="ltr">{customer.phone}</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">الشحنات ({customer.shipments.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشحنة</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customer.shipments.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><Link href={`/app/shipments/${s.id}`} className="text-primary hover:underline">{s.shipmentNumber}</Link></TableCell>
                  <TableCell>{s.totalCartons}</TableCell>
                  <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
              {customer.shipments.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">لا توجد شحنات</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
