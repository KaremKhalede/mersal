import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchScope } from "@/lib/branch-scope";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "إنشاء",
  STATUS_CHANGE: "تغيير حالة",
  UPLOAD: "رفع مستند",
  COMPLETE: "إنهاء",
};

export default async function ActivityLogPage() {
  const user = await requireCompanyUser();
  requireCan(user, "reports", "view");
  // AuditLog has no branch field of its own (it spans many entity types, each with a different
  // branch shape) — scoping by the acting user's branchId is the honest proxy: a branch employee
  // sees what people at their branch did, same restriction the rest of the app applies to them.
  // System-generated entries (userId null) have no branch to match, so they drop out for a
  // branch-scoped viewer, same as any other branch-scoped list defaults to "not visible" over
  // "visible by default."
  const branchScope = getBranchScope(user);
  const logs = await prisma.auditLog.findMany({
    where: { companyId: user.companyId!, ...(branchScope ? { user: { branchId: branchScope } } : {}) },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">سجل النشاطات</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المستخدم</TableHead>
                <TableHead>الإجراء</TableHead>
                <TableHead>الكيان</TableHead>
                <TableHead>التفاصيل</TableHead>
                <TableHead>الوقت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.user?.name ?? "النظام"}</TableCell>
                  <TableCell>{ACTION_LABELS[l.action] ?? l.action}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{l.entityType}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-xs truncate" dir="ltr">{l.metadata}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString("ar-SA")}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد نشاطات مسجّلة</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
