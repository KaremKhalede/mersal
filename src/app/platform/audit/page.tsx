import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function PlatformAuditPage() {
  await requirePlatformAdmin();
  const logs = await prisma.auditLog.findMany({
    include: { user: true, company: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">سجلات النظام</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الشركة</TableHead>
                <TableHead>المستخدم</TableHead>
                <TableHead>الإجراء</TableHead>
                <TableHead>الكيان</TableHead>
                <TableHead>الوقت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.company?.name ?? "المنصة"}</TableCell>
                  <TableCell>{l.user?.name ?? "النظام"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.entityType}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString("ar-SA")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
