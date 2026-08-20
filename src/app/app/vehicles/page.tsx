import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { listVehiclesPaged } from "@/modules/vehicles/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { Truck } from "lucide-react";
import Link from "next/link";
import { VehicleFilters } from "./filters";
import { AddVehicleDialog } from "./add-vehicle-dialog";
import { VehicleRowActions } from "./vehicle-row-actions";
import { VEHICLE_TYPE_LABELS, type VehicleType } from "@/lib/enums";

const PAGE_SIZE = 10;

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "vehicles", "view");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;

  const { items: vehicles, total, pageCount } = await listVehiclesPaged({
    companyId: user.companyId!,
    search: sp.q,
    status: sp.status,
    page,
    pageSize: PAGE_SIZE,
  });

  const canCreate = can(user, "vehicles", "create");
  const canEdit = can(user, "vehicles", "edit");
  const canDisable = can(user, "vehicles", "disable");
  const qs = `${sp.q ? `&q=${sp.q}` : ""}${sp.status ? `&status=${sp.status}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Truck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">المركبات</h2>
            <p className="text-sm text-muted-foreground">إدارة مركبات الشركة المستخدمة في الرحلات</p>
          </div>
        </div>

        {canCreate && <AddVehicleDialog />}
      </div>

      {vehicles.length === 0 && !sp.q && !sp.status ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">لا توجد مركبات</p>
              <p className="text-sm text-muted-foreground">أضف أول مركبة لاستخدامها في الرحلات.</p>
            </div>
            {canCreate && <AddVehicleDialog />}
          </CardContent>
        </Card>
      ) : (
        <>
          <VehicleFilters status={sp.status} search={sp.q} />

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم اللوحة</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>عدد الرحلات</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">
                        <Link href={`/app/vehicles/${v.id}`} dir="ltr" className="text-foreground hover:text-primary hover:underline">
                          {v.plateNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{VEHICLE_TYPE_LABELS[v.type as VehicleType] ?? v.type ?? "—"}</TableCell>
                      <TableCell>{v._count.trips}</TableCell>
                      <TableCell>
                        <ActiveBadge active={v.isActive} activeLabel="نشطة" inactiveLabel="غير نشطة" />
                      </TableCell>
                      <TableCell>
                        <VehicleRowActions
                          vehicle={{ id: v.id, plateNumber: v.plateNumber, type: v.type, notes: v.notes, isActive: v.isActive }}
                          canEdit={canEdit}
                          canDisable={canDisable}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {vehicles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد مركبات مطابقة</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            itemsShown={vehicles.length}
            itemLabel="مركبة"
            buildHref={(p) => `/app/vehicles?page=${p}${qs}`}
          />
        </>
      )}
    </div>
  );
}
