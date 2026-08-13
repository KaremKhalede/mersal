import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listRoles } from "@/modules/roles/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus, Pencil } from "lucide-react";
import Link from "next/link";
import { createRoleAction } from "./actions";
import { PermissionGrid } from "./permission-grid";

export default async function RolesPage() {
  const user = await requireCompanyUser();
  requireCan(user, "roles", "view");
  const roles = await listRoles(user.companyId!);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الأدوار والصلاحيات</h2>
        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> دور جديد</Button>}
          title="إضافة دور جديد"
          action={async (fd) => {
            "use server";
            await createRoleAction(fd);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم الدور</Label>
            <Input id="name" name="name" placeholder="مشرف شحن" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">الوصف</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <PermissionGrid />
        </FormDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم الدور</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>المستخدمون</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.description}</TableCell>
                  <TableCell>{r._count.users}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-success/30 bg-success/15 text-success">نشط</Badge>
                  </TableCell>
                  <TableCell>
                    {!r.isSystem && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/app/roles/${r.id}`}><Pencil className="h-4 w-4" /> تعديل</Link>
                      </Button>
                    )}
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
