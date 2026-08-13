import { requirePlatformAdmin } from "@/lib/auth";
import { listCompanies } from "@/modules/companies/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { ActionButton } from "@/components/shell/action-button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { createCompanyAction, toggleCompanyStatusAction } from "./actions";

export default async function PlatformCompaniesPage() {
  await requirePlatformAdmin();
  const companies = await listCompanies();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الشركات ({companies.length})</h2>
        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> شركة جديدة</Button>}
          title="إضافة شركة شحن جديدة"
          description="سيتم إنشاء حساب مدير الشركة تلقائياً"
          action={createCompanyAction}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="name">اسم الشركة</Label><Input id="name" name="name" required /></div>
            <div className="space-y-1.5"><Label htmlFor="slug">المعرف (بالإنجليزية)</Label><Input id="slug" name="slug" dir="ltr" required /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="phone">الهاتف</Label><Input id="phone" name="phone" dir="ltr" /></div>
            <div className="space-y-1.5"><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" name="email" dir="ltr" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="adminName">اسم مدير الشركة</Label><Input id="adminName" name="adminName" required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="adminEmail">بريد المدير</Label><Input id="adminEmail" name="adminEmail" type="email" dir="ltr" required /></div>
            <div className="space-y-1.5"><Label htmlFor="adminPassword">كلمة المرور</Label><Input id="adminPassword" name="adminPassword" type="password" dir="ltr" required minLength={6} /></div>
          </div>
        </FormDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم الشركة</TableHead>
                <TableHead>الفروع</TableHead>
                <TableHead>الشحنات</TableHead>
                <TableHead>المستخدمون</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Link href={`/platform/companies/${c.id}`} className="font-medium text-primary hover:underline">{c.name}</Link></TableCell>
                  <TableCell>{c._count.branches}</TableCell>
                  <TableCell>{c._count.shipments}</TableCell>
                  <TableCell>{c._count.users}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.status === "ACTIVE" ? "border-success/30 bg-success/15 text-success" : "border-destructive/30 bg-destructive/10 text-destructive"}>
                      {c.status === "ACTIVE" ? "نشطة" : "موقوفة"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionButton action={async () => { "use server"; await toggleCompanyStatusAction(c.id, c.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"); }}>
                      {c.status === "ACTIVE" ? "إيقاف" : "تفعيل"}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
