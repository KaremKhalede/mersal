import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { NotificationLog, Shipment } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = { SENT: "أُرسلت", FAILED: "فشلت", PENDING: "قيد الإرسال", SKIPPED: "متخطاة" };
const STATUS_CLASSES: Record<string, string> = {
  SENT: "border-success/30 bg-success/15 text-success",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  PENDING: "border-muted-foreground/30 bg-muted text-muted-foreground",
  SKIPPED: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

type LogRow = NotificationLog & { shipment: Shipment | null };

function NotificationTable({ logs, emptyText }: { logs: LogRow[]; emptyText: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الشحنة</TableHead>
              <TableHead>الحدث</TableHead>
              <TableHead>الرسالة</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>التاريخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.shipmentId ? <Link href={`/app/shipments/${l.shipmentId}`} className="text-primary hover:underline">{l.shipment?.shipmentNumber}</Link> : "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.event}</TableCell>
                <TableCell className="max-w-md truncate text-sm">{l.message}</TableCell>
                <TableCell dir="ltr" className="text-sm">{l.toPhone}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_CLASSES[l.status] ?? STATUS_CLASSES.FAILED}>{STATUS_LABELS[l.status] ?? l.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(l.createdAt).toLocaleString("ar-SA")}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{emptyText}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default async function NotificationsPage() {
  const user = await requireCompanyUser();
  const logs = await prisma.notificationLog.findMany({
    where: { companyId: user.companyId! },
    include: { shipment: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Same data, two views: rows that actually need a human's attention vs. the full send history.
  const needsAttention = logs.filter((l) => l.status === "FAILED" || l.status === "SKIPPED");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">الإشعارات</h2>
        <p className="text-sm text-muted-foreground">رسائل واتساب المُرسلة للعملاء</p>
      </div>

      <Tabs defaultValue="center" dir="rtl">
        <TabsList>
          <TabsTrigger value="center">مركز الإشعارات {needsAttention.length > 0 && `(${needsAttention.length})`}</TabsTrigger>
          <TabsTrigger value="log">سجل الإرسال</TabsTrigger>
        </TabsList>
        <TabsContent value="center" className="pt-3">
          <NotificationTable logs={needsAttention} emptyText="لا توجد إشعارات تحتاج انتباهك حالياً" />
        </TabsContent>
        <TabsContent value="log" className="pt-3">
          <NotificationTable logs={logs} emptyText="لا توجد إشعارات بعد" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
