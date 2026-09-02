import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listShipmentsForExport } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { formatPhoneDisplay } from "@/lib/phone";
import { routeLabel } from "@/lib/utils";
import type { ShipmentStatus } from "@/lib/enums";
import type { ShipmentSortDirection } from "@/modules/shipments/service";

export default async function ShipmentsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; branchId?: string; dir?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const sp = await searchParams;

  const ownScope = getBranchScope(user);
  const effectiveBranchId = ownScope ?? (sp.branchId || undefined);
  const dir: ShipmentSortDirection = sp.dir === "asc" ? "asc" : "desc";

  const items = await listShipmentsForExport({
    companyId: user.companyId!,
    search: sp.q,
    status: sp.status as ShipmentStatus | undefined,
    branchId: effectiveBranchId,
    dir,
  });

  return (
    <div className="bg-white min-h-screen text-black">
      <style dangerouslySetInnerHTML={{ __html: `
        @page { size: auto; margin: 0; }
        @media print {
          body { padding: 15mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
        }
      `}} />
      
      <div className="mb-6 flex items-center justify-between border-b-2 border-gray-900 pb-4">
        <div>
          {/* If there is a logo, it would go here. For now, large clear text is good */}
          <h1 className="text-3xl font-black tracking-tight">{user.company!.name}</h1>
          <p className="text-gray-600 mt-1 font-medium">كشف الشحنات</p>
        </div>
        <div className="text-left text-sm font-medium text-gray-700 whitespace-nowrap">
          <p>العدد الإجمالي: {items.length} شحنة</p>
          <p>تاريخ الطباعة: {new Date().toLocaleDateString("ar-SA")}</p>
        </div>
      </div>

      <Table className="text-sm">
        <TableHeader>
          <TableRow className="border-b-2 border-gray-300">
            <TableHead className="font-bold text-gray-900">رقم الشحنة</TableHead>
            <TableHead className="font-bold text-gray-900">العميل</TableHead>
            <TableHead className="font-bold text-gray-900">من ← إلى</TableHead>
            <TableHead className="text-center font-bold text-gray-900">الكراتين</TableHead>
            <TableHead className="font-bold text-gray-900">الحالة</TableHead>
            <TableHead className="font-bold text-gray-900">تاريخ الإنشاء</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((s) => (
            <TableRow key={s.id} className="border-b border-gray-200">
              <TableCell className="font-bold text-gray-900">
                {s.shipmentNumber}
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start space-y-0.5">
                  <span className="font-medium">{s.customer.name}</span>
                  <span className="inline-block text-xs text-gray-500" dir="ltr">{formatPhoneDisplay(s.customer.phone)}</span>
                </div>
              </TableCell>
              <TableCell className="text-gray-700">{routeLabel(s.loadBranch.name, s.unloadBranch.name)}</TableCell>
              <TableCell className="text-center font-medium text-gray-900" dir="ltr">{s.arrivedCartons}/{s.totalCartons}</TableCell>
              <TableCell>
                <ShipmentStatusBadge status={s.status} />
              </TableCell>
              <TableCell className="text-gray-600">
                {s.createdAt.toLocaleDateString("ar-SA")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

    </div>
  );
}
