import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { listRoles } from "@/modules/roles/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActiveBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus, Eye } from "lucide-react";
import Link from "next/link";
import { createRoleAction } from "./actions";
import { PermissionGrid } from "./permission-grid";
import { RoleRowActions } from "./role-row-actions";
import { PageHeader } from "@/components/shell/page-header";

export default async function RolesPage() {
  const user = await requireCompanyUser();
  requireCan(user, "roles", "view");
  const roles = await listRoles(user.companyId!);
  const canManage = can(user, "roles", "manage");

  return (
    <div className="space-y-4">
      <PageHeader
        title="الأدوار والصلاحيات"
        description="من يستطيع رؤية ماذا، ومن يستطيع تغييره"
        actions={canManage ? (
              <FormDialog
                trigger={<Button><Plus className="h-4 w-4" /> دور جديد</Button>}
                title="إضافة دور جديد"
                action={createRoleAction}
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
        ) : undefined}
      />

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
                    <ActiveBadge active={r.isActive} />
                  </TableCell>
                  <TableCell>
                    {canManage &&
                      (r.isSystem ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/app/roles/${r.id}`}><Eye className="h-4 w-4" /> عرض</Link>
                        </Button>
                      ) : (
                        <RoleRowActions role={{ id: r.id, name: r.name, isActive: r.isActive, userCount: r._count.users }} />
                      ))}
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
