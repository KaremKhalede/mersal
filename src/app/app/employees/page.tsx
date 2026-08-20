import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { listEmployeesPaged } from "@/modules/users/service";
import { listRoles } from "@/modules/roles/service";
import { listBranches } from "@/modules/branches/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Pagination } from "@/components/ui/pagination";
import { Users, UserRound } from "lucide-react";
import Link from "next/link";
import { EmployeeFilters } from "./filters";
import { AddEmployeeDialog } from "./add-employee-dialog";
import { EmployeeRowActions } from "./employee-row-actions";

const PAGE_SIZE = 10;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; roleId?: string; branchId?: string; status?: string; page?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "employees", "view");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  // Same convention as /app/customers: a branch-scoped employee's view is always pinned to their
  // own branch; a company-wide role may narrow theirs via the filter dropdown.
  const ownScope = getBranchScope(user);
  const effectiveBranchId = ownScope ?? (sp.branchId || undefined);

  const [{ items: employees, total, pageCount }, roles, branches] = await Promise.all([
    listEmployeesPaged({ companyId: user.companyId!, search: sp.q, roleId: sp.roleId, branchId: effectiveBranchId, status: sp.status, page, pageSize: PAGE_SIZE }),
    listRoles(user.companyId!),
    listBranches(user.companyId!),
  ]);

  const canCreate = can(user, "employees", "create");
  const canEdit = can(user, "employees", "edit");
  const canDisable = can(user, "employees", "disable");

  const qs = `${sp.q ? `&q=${sp.q}` : ""}${sp.roleId ? `&roleId=${sp.roleId}` : ""}${sp.branchId ? `&branchId=${sp.branchId}` : ""}${sp.status ? `&status=${sp.status}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">الموظفون</h2>
            <p className="text-sm text-muted-foreground">إدارة موظفي الشركة وحسابات الدخول والصلاحيات.</p>
          </div>
        </div>

        {canCreate && <AddEmployeeDialog roles={roles} branches={branches} showBranchField={!ownScope} />}
      </div>

      <EmployeeFilters roles={roles} branches={branches} roleId={sp.roleId} branchId={sp.branchId} status={sp.status} search={sp.q} showBranchFilter={!ownScope} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الموظف</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>رقم الموظف</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>الجوال</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/app/employees/${e.id}`} className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="font-medium text-foreground hover:text-primary hover:underline">{e.name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.role?.name ?? (e.userType === "DRIVER" ? "سائق" : "—")}</TableCell>
                  <TableCell className="text-muted-foreground">{e.branch?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground" dir="ltr">{e.employeeCode ?? "—"}</TableCell>
                  <TableCell dir="ltr" className="text-start text-muted-foreground">{e.email}</TableCell>
                  <TableCell dir="ltr" className="text-start text-muted-foreground">{e.phone ?? "—"}</TableCell>
                  <TableCell>
                    <ActiveBadge active={e.status === "ACTIVE"} />
                  </TableCell>
                  <TableCell>
                    <EmployeeRowActions
                      employee={{ id: e.id, name: e.name, email: e.email, phone: e.phone, branchId: e.branchId, status: e.status, role: e.role }}
                      roles={roles}
                      branches={branches}
                      showBranchField={!ownScope}
                      isSelf={e.id === user.id}
                      canEdit={canEdit}
                      canDisable={canDisable}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">لا يوجد موظفون مطابقون</TableCell>
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
        itemsShown={employees.length}
        itemLabel="موظف"
        buildHref={(p) => `/app/employees?page=${p}${qs}`}
      />
    </div>
  );
}
