import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const TYPE_LABELS: Record<string, string> = { PLATFORM_ADMIN: "مدير منصة", COMPANY_USER: "موظف شركة", DRIVER: "سائق" };

export default async function PlatformUsersPage() {
  await requirePlatformAdmin();
  const users = await prisma.user.findMany({
    include: { company: true, role: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">المستخدمون ({users.length})</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الشركة</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell dir="ltr" className="text-sm">{u.email}</TableCell>
                  <TableCell>{TYPE_LABELS[u.userType]}</TableCell>
                  <TableCell>{u.company?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={u.status === "ACTIVE" ? "border-success/30 bg-success/15 text-success" : "bg-muted"}>
                      {u.status === "ACTIVE" ? "نشط" : "معطّل"}
                    </Badge>
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
