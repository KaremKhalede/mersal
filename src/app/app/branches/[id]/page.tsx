import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchDetail } from "@/modules/branches/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Users, Phone, MapPin } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";
import { PageHeader } from "@/components/shell/page-header";

export default async function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "branches", "view");
  const { id } = await params;
  const { branch, employees } = await getBranchDetail(user.companyId!, id);

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={branch.name}
        description={`${branch.city}، ${branch.country}`}
        badge={<ActiveBadge active={branch.status === "ACTIVE"} />}
        parent={{ label: "الفروع", href: "/app/branches" }}
      />

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

      {/*
        How to reach this branch — the two facts a customer collecting from it and a driver stuck
        at it both need, and which the product had nowhere to store until now.

        Rendered only when at least one is filled. An empty "الهاتف: —" row on every branch of every
        company that never entered one is a line that teaches people to stop reading the card.
      */}
      {(branch.phone || branch.address) && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><Phone className="h-4 w-4" /> التواصل مع الفرع</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {branch.phone && (
              <div>
                <p className="text-xs text-muted-foreground">هاتف الفرع</p>
                {/* A real `tel:` link: this page is opened on a phone as often as on a desk. */}
                <a href={`tel:${branch.phone}`} dir="ltr" className="text-sm font-medium text-primary hover:underline">
                  {formatPhoneDisplay(branch.phone)}
                </a>
              </div>
            )}
            {branch.address && (
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> العنوان</p>
                <p className="text-sm font-medium">{branch.address}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
