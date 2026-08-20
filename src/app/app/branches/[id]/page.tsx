import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchDetail } from "@/modules/branches/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Building2, MapPin, Users, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "branches", "view");
  const { id } = await params;
  const { branch, employees } = await getBranchDetail(user.companyId!, id);

  return (
    <div className="space-y-4">
      <Link href="/app/branches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-4 w-4" /> رجوع إلى الفروع
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {branch.name}
            <ActiveBadge active={branch.status === "ACTIVE"} />
          </h2>
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" /> {branch.city}، {branch.country}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold">{branch._count.employees}</p>
          <p className="text-xs text-muted-foreground">عدد الموظفين</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold">{branch.city}</p>
          <p className="text-xs text-muted-foreground">المدينة</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold">{branch.country}</p>
          <p className="text-xs text-muted-foreground">الدولة</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><Users className="h-4 w-4" /> الموظفون</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{e.email}</p>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.userType === "DRIVER" ? "سائق" : "موظف"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.role?.name ?? "—"}</TableCell>
                  <TableCell><ActiveBadge active={e.status === "ACTIVE"} inactiveLabel="معطّل" /></TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا يوجد موظفون في هذا الفرع</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
