import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listBranches, listBranchesPaged } from "@/modules/branches/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus, Building2, Users } from "lucide-react";
import { createBranchAction } from "./actions";
import { BranchFilters } from "./filters";
import { BranchRowActions } from "./branch-row-actions";

const PAGE_SIZE_DEFAULT = 10;

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; country?: string; status?: string; page?: string; pageSize?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "branches", "view");
  const sp = await searchParams;
  const page = Number(sp.page) || 1;
  const pageSize = Number(sp.pageSize) || PAGE_SIZE_DEFAULT;

  const [{ items: branches, total, pageCount }, allBranches] = await Promise.all([
    listBranchesPaged(user.companyId!, { search: sp.q, country: sp.country, status: sp.status, page, pageSize }),
    listBranches(user.companyId!),
  ]);
  const countries = [...new Set(allBranches.map((b) => b.country))].sort();

  const qs = `${sp.q ? `&q=${sp.q}` : ""}${sp.country ? `&country=${sp.country}` : ""}${sp.status ? `&status=${sp.status}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">الفروع</h2>
            <p className="text-sm text-muted-foreground">إدارة فروع المؤسسة ومعلوماتها التشغيلية</p>
          </div>
        </div>

        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> فرع جديد</Button>}
          title="إضافة فرع جديد"
          action={async (fd) => {
            "use server";
            return createBranchAction(fd);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم الفرع</Label>
            <Input id="name" name="name" placeholder="فرع الرياض" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">المدينة</Label>
              <Input id="city" name="city" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">الدولة</Label>
              <Input id="country" name="country" required />
            </div>
          </div>
        </FormDialog>
      </div>

      <BranchFilters countries={countries} status={sp.status} country={sp.country} search={sp.q} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الفرع</TableHead>
                <TableHead>المدينة</TableHead>
                <TableHead>الدولة</TableHead>
                <TableHead>الموظفون</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {b.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{b.city}</TableCell>
                  <TableCell className="text-muted-foreground">{b.country}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {b._count.employees}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ActiveBadge active={b.status === "ACTIVE"} />
                  </TableCell>
                  <TableCell>
                    <BranchRowActions branch={{ id: b.id, name: b.name, city: b.city, country: b.country, status: b.status }} />
                  </TableCell>
                </TableRow>
              ))}
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    لا توجد فروع مطابقة
                  </TableCell>
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
        itemsShown={branches.length}
        itemLabel="فرع"
        buildHref={(p) => `/app/branches?page=${p}&pageSize=${pageSize}${qs}`}
        pageSize={pageSize}
      />
    </div>
  );
}
