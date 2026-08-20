import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { toMoney } from "@/lib/money";
import { PLATFORM_ID } from "@/lib/platform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PlatformSettingsForm } from "./settings-form";
import { createPlatformRoleAction } from "./roles/actions";
import { listPlatformRoles } from "@/modules/platform-roles/service";
import { canPlatform } from "@/lib/rbac";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FormDialog } from "@/components/shell/form-dialog";
import Link from "next/link";
import { Plus, ShieldCheck, ChevronLeft } from "lucide-react";

export default async function PlatformSettingsPage() {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "settings", "view");
  const [platform, roles] = await Promise.all([
    prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } }),
    listPlatformRoles(),
  ]);
  // Role management lives here rather than as its own sidebar entry: it is configuration, and the
  // console is deliberately five destinations.
  const canManage = canPlatform(me, "settings", "manage");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">إعدادات المنصة</h2>
      <Card className="max-w-xl">
        <CardHeader><CardTitle className="text-base">الإعدادات العامة</CardTitle></CardHeader>
        <CardContent>
          <PlatformSettingsForm
            name={platform.name}
            feePerCartonYER={toMoney(platform.feePerCartonYER)}
            whatsappSenderName={platform.whatsappSenderName}
            canManage={canManage}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">الأدوار والصلاحيات</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              الدور يحدد الصفحات التي يصل إليها موظف المنصة. تُضاف الصلاحيات الجديدة هنا تلقائياً.
            </p>
          </div>
          {canManage && (
            <FormDialog
              trigger={<Button><Plus className="h-4 w-4" /> دور جديد</Button>}
              title="إنشاء دور"
              description="حدّد الصلاحيات بعد الإنشاء من صفحة الدور"
              action={createPlatformRoleAction}
              submitLabel="إنشاء"
            >
              <div className="space-y-1.5">
                <Label htmlFor="role-name">اسم الدور</Label>
                <Input id="role-name" name="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-description">الوصف</Label>
                <Input id="role-description" name="description" placeholder="يظهر عند اختيار الدور" />
              </div>
            </FormDialog>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الدور</TableHead>
                  <TableHead>المستخدمون</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id} className="transition-colors hover:bg-muted/40">
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        {r.isSuperAdmin && <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}
                        {r.name}
                      </span>
                      {r.description && <span className="block text-[11px] text-muted-foreground">{r.description}</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{r.userCount}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={r.isActive ? "border-success/30 bg-success/15 text-success" : "bg-muted text-muted-foreground"}
                      >
                        {r.isActive ? "مفعّل" : "معطّل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {canManage ? (
                        <Link
                          href={`/platform/settings/roles/${r.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          تعديل الصلاحيات <ChevronLeft className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
