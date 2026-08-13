import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listShipments } from "@/modules/shipments/service";
import { listBranches } from "@/modules/branches/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { NewShipmentDialog } from "./new-shipment-dialog";
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const sp = await searchParams;
  const page = Number(sp.page || 1);

  const [{ items, total, pageCount }, branches] = await Promise.all([
    listShipments({ companyId: user.companyId!, search: sp.q, status: sp.status as ShipmentStatus | undefined, page, branchId: getBranchScope(user) }),
    listBranches(user.companyId!),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الشحنات ({total})</h2>
        <NewShipmentDialog branches={branches} />
      </div>

      <form className="flex flex-wrap gap-2 items-center">
        <Input name="q" defaultValue={sp.q} placeholder="ابحث برقم الشحنة أو اسم العميل..." className="max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">كل الحالات</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{SHIPMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">تصفية</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشحنة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>من</TableHead>
                <TableHead>إلى</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/app/shipments/${s.id}`} className="font-medium text-primary hover:underline">{s.shipmentNumber}</Link>
                  </TableCell>
                  <TableCell>{s.customer.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.loadBranch.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.unloadBranch.name}</TableCell>
                  <TableCell>{s.arrivedCartons}/{s.totalCartons}</TableCell>
                  <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد نتائج</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
            <Link key={p} href={`/app/shipments?page=${p}${sp.q ? `&q=${sp.q}` : ""}${sp.status ? `&status=${sp.status}` : ""}`}
              className={`h-8 w-8 flex items-center justify-center rounded-md border ${p === page ? "bg-primary text-primary-foreground" : ""}`}>
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
