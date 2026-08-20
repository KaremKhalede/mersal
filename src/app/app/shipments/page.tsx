import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listShipments, shipmentStatusCounts } from "@/modules/shipments/service";
import { listBranches } from "@/modules/branches/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { PrintButton } from "@/components/labels/print-button";
import { ExportButton } from "./export-button";
import { ShipmentRowActions } from "./row-actions";
import Link from "next/link";
import { NewShipmentDialog } from "./new-shipment-dialog";
import { Package, CheckCircle2, Truck, PackageCheck, AlertTriangle } from "lucide-react";
import { formatBusinessDateTime } from "@/lib/timezone";
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; branchId?: string; page?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const sp = await searchParams;
  const page = Number(sp.page || 1);
  // Branch-scoped roles can never widen their view via the filter; company-wide roles may narrow
  // theirs to any one branch.
  const ownScope = getBranchScope(user);
  const effectiveBranchId = ownScope ?? (sp.branchId || undefined);

  const [{ items, total, pageCount }, branches, counts] = await Promise.all([
    listShipments({ companyId: user.companyId!, search: sp.q, status: sp.status as ShipmentStatus | undefined, page, branchId: effectiveBranchId }),
    listBranches(user.companyId!),
    shipmentStatusCounts(user.companyId!, effectiveBranchId),
  ]);

  const qs = `${sp.q ? `&q=${sp.q}` : ""}${sp.status ? `&status=${sp.status}` : ""}${sp.branchId ? `&branchId=${sp.branchId}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold">الشحنات ({total})</h2>
        <div className="flex items-center gap-2 print:hidden">
          <ExportButton status={sp.status as ShipmentStatus | undefined} search={sp.q} branchId={effectiveBranchId} />
          <PrintButton />
          <NewShipmentDialog branches={branches} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 print:hidden">
        <StatCard label="إجمالي الشحنات" value={counts.total} icon={Package} />
        <StatCard label="تم التسليم" value={counts.delivered} icon={CheckCircle2} tone="success" />
        <StatCard label="في الطريق" value={counts.inTransit} icon={Truck} tone="warning" />
        <StatCard label="جاهزة للاستلام" value={counts.readyForPickup} icon={PackageCheck} />
        <StatCard label="وصول جزئي / استثناء" value={counts.needsAttention} icon={AlertTriangle} tone="destructive" />
      </div>

      <form className="flex flex-wrap gap-2 items-center print:hidden">
        <Input name="q" defaultValue={sp.q} placeholder="ابحث برقم الشحنة أو اسم العميل..." className="max-w-xs" />
        {!ownScope && (
          <select
            name="branchId"
            defaultValue={sp.branchId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
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
                <TableHead>من ← إلى</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead className="print:hidden"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/app/shipments/${s.id}`} className="font-medium text-primary hover:underline">{s.shipmentNumber}</Link>
                  </TableCell>
                  <TableCell>
                    <p>{s.customer.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{s.customer.phone}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{s.loadBranch.name} ← {s.unloadBranch.name}</TableCell>
                  <TableCell>{s.arrivedCartons}/{s.totalCartons}</TableCell>
                  <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatBusinessDateTime(s.createdAt, { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <ShipmentRowActions id={s.id} />
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد نتائج</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemsShown={items.length}
        itemLabel="شحنة"
        buildHref={(p) => `/app/shipments?page=${p}${qs}`}
      />
    </div>
  );
}
