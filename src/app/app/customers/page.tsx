import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listCustomers } from "@/modules/customers/service";
import { listBranches } from "@/modules/branches/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { Users, User } from "lucide-react";
import Link from "next/link";
import { formatBusinessDateTime } from "@/lib/timezone";
import { CustomerFilters } from "./filters";
import { CustomerRowActions } from "./customer-row-actions";
import { AddCustomerDialog } from "./add-customer-dialog";

const PAGE_SIZE = 10;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; branchId?: string; status?: string; page?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "customers", "view");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  // Same convention as /app/shipments: a branch-scoped employee's view is always pinned to their
  // own branch; a company-wide role may narrow theirs via the filter dropdown.
  const ownScope = getBranchScope(user);
  const effectiveBranchId = ownScope ?? (sp.branchId || undefined);

  const [{ items: customers, total, pageCount }, branches] = await Promise.all([
    listCustomers({ companyId: user.companyId!, search: sp.q, branchId: effectiveBranchId, status: sp.status, page, pageSize: PAGE_SIZE }),
    listBranches(user.companyId!),
  ]);

  const qs = `${sp.q ? `&q=${sp.q}` : ""}${sp.branchId ? `&branchId=${sp.branchId}` : ""}${sp.status ? `&status=${sp.status}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">العملاء</h2>
            <p className="text-sm text-muted-foreground">إدارة عملاء المؤسسة ومعلومات التواصل الخاصة بهم.</p>
          </div>
        </div>

        <AddCustomerDialog branches={branches} />
      </div>

      <CustomerFilters branches={branches} branchId={sp.branchId} status={sp.status} search={sp.q} showBranchFilter={!ownScope} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>العميل</TableHead>
                <TableHead>الجوال</TableHead>
                <TableHead>إجمالي الشحنات</TableHead>
                <TableHead>آخر شحنة</TableHead>
                <TableHead>الفرع الرئيسي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => {
                const lastShipment = c.shipments[0];
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/app/customers/${c.id}`} className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <User className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground hover:text-primary hover:underline">{c.name}</span>
                          {c.address && <span className="block truncate text-xs text-muted-foreground">{c.address}</span>}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell dir="ltr" className="text-start text-muted-foreground">{c.phone}</TableCell>
                    <TableCell>{c._count.shipments.toLocaleString()}</TableCell>
                    <TableCell>
                      {lastShipment ? (
                        <div className="text-xs">
                          <p className="text-muted-foreground">{formatBusinessDateTime(lastShipment.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                          <Link href={`/app/shipments/${lastShipment.id}`} className="font-medium text-primary hover:underline">{lastShipment.shipmentNumber}</Link>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.homeBranch?.name ?? "—"}</TableCell>
                    <TableCell>
                      <ActiveBadge active={c.status === "ACTIVE"} />
                    </TableCell>
                    <TableCell>
                      <CustomerRowActions
                        customer={{ id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address, homeBranchId: c.homeBranchId, status: c.status }}
                        branches={branches}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا يوجد عملاء مطابقون</TableCell>
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
        itemsShown={customers.length}
        itemLabel="عميل"
        buildHref={(p) => `/app/customers?page=${p}${qs}`}
      />
    </div>
  );
}
