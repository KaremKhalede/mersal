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
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, NoResults, TableEmpty } from "@/components/feedback/empty-state";

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
      <PageHeader
        title="المركبات"
        description="إدارة مركبات الشركة المستخدمة في الرحلات"
        actions={canCreate && <AddVehicleDialog />}
      />

      {vehicles.length === 0 && !sp.q && !sp.status ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Truck}
              title="لا توجد مركبات"
              description="أضف أول مركبة لاستخدامها في الرحلات."
              action={canCreate ? <AddVehicleDialog /> : undefined}
            />
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
                    <TableEmpty colSpan={5}>
                      <NoResults resetHref="/app/vehicles" label="لا توجد مركبات مطابقة" />
                    </TableEmpty>
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
