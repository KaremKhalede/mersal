import { requireCompanyUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { NotificationLog, Shipment } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { formatDateStamp } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { SHIPMENT_EVENT_LABELS, NOTIFICATION_RECIPIENT_LABELS, type ShipmentEvent, type NotificationRecipient } from "@/lib/enums";
import { can } from "@/lib/rbac";
import { RetryNotificationButton } from "./retry-button";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, TableEmpty } from "@/components/feedback/empty-state";
import { BellOff } from "lucide-react";

const STATUS_LABELS: Record<string, string> = { SENT: "أُرسلت", FAILED: "فشلت", PENDING: "قيد الإرسال", SKIPPED: "متخطاة" };
const STATUS_CLASSES: Record<string, string> = {
  SENT: "border-success/30 bg-success/15 text-success",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  PENDING: "border-muted-foreground/30 bg-muted text-muted-foreground",
  SKIPPED: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

type LogRow = NotificationLog & { shipment: Shipment | null };

/** NotificationLog.providerError is technical English — ours, or verbatim from Meta. The two
 * reasons this app generates itself are the ones an Arabic-speaking branch employee is actually
 * expected to act on, so those get read out in Arabic; anything from the provider is passed through
 * untranslated rather than guessed at. */
function reasonText(error: string) {
  const forReceiver = error.includes("receiver");
  if (error.startsWith("no phone number on file")) return forReceiver ? "لا يوجد رقم جوال للمستلم" : "لا يوجد رقم جوال للمرسِل";
  if (error.startsWith("invalid or unrecognized phone number format")) return forReceiver ? "رقم جوال المستلم غير صالح" : "رقم جوال المرسِل غير صالح";
  if (error.startsWith("already delivered to this number")) return "وصلت الرسالة لنفس الرقم عبر الطرف الآخر";
  return error;
}

function NotificationTable({ logs, emptyTitle, emptyText, canRetry }: { logs: LogRow[]; emptyTitle: string; emptyText: string; canRetry: boolean }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {/* Action first, i.e. right-most in RTL. On a phone the table scrolls sideways inside
                  its container, and a retry button parked in the last column is a button nobody
                  finds — the one thing this tab exists for has to be the thing already on screen. */}
              {canRetry && <TableHead>الإجراء</TableHead>}
              <TableHead>الشحنة</TableHead>
              <TableHead>الحدث</TableHead>
              <TableHead>الطرف</TableHead>
              {/* Hidden below md: on a phone these three push the action column out of view, and
                  reaching a retry button by scrolling a table sideways is not reaching it. The row
                  keeps what identifies the message (shipment, event, party) and what acts on it. */}
              <TableHead className="hidden md:table-cell">الرسالة</TableHead>
              <TableHead className="hidden md:table-cell">الجوال</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="hidden md:table-cell">التاريخ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((l) => (
              <TableRow key={l.id}>
                {/* Only FAILED is retryable. SENT is terminal (retrying it is the duplicate this
                    log exists to prevent) and SKIPPED needs a data fix, not another attempt.
                    
                    But "not retryable" is not the same as "nothing to do", and this cell used to be
                    empty for every SKIPPED row — the screen stated a reason ("لا يوجد رقم جوال
                    للمستلم") and then offered no way to act on it. The fix for every skip reason
                    this app generates is the same: correct the number on the shipment. So the row
                    points there, which is a real next step rather than a blank. */}
                {canRetry && (
                  <TableCell>
                    {l.status === "FAILED" ? (
                      <RetryNotificationButton logId={l.id} />
                    ) : l.status === "SKIPPED" && l.shipmentId ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/shipments/${l.shipmentId}`}>
                          <Wrench className="h-3.5 w-3.5" /> تصحيح البيانات
                        </Link>
                      </Button>
                    ) : null}
                  </TableCell>
                )}
                <TableCell>{l.shipmentId ? <Link href={`/app/shipments/${l.shipmentId}`} className="text-primary hover:underline">{l.shipment?.shipmentNumber}</Link> : "—"}</TableCell>
                <TableCell className="text-sm">{SHIPMENT_EVENT_LABELS[l.event as ShipmentEvent] ?? l.event}</TableCell>
                {/* Without this the log is ambiguous the moment one event reaches two people: two
                    rows, same event, different numbers, no way to tell which is the receiver's. */}
                <TableCell className="text-sm">{NOTIFICATION_RECIPIENT_LABELS[l.recipient as NotificationRecipient] ?? l.recipient}</TableCell>
                <TableCell className="hidden max-w-[12rem] truncate text-sm md:table-cell">{l.message}</TableCell>
                <TableCell dir="ltr" className="hidden text-sm md:table-cell">{formatPhoneDisplay(l.toPhone)}</TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline" className={STATUS_CLASSES[l.status] ?? STATUS_CLASSES.FAILED}>{STATUS_LABELS[l.status] ?? l.status}</Badge>
                  {/* A skipped/failed row without its reason leaves the employee guessing whether the
                      customer was told anything at all. The reason is the whole point of the tab.
                      Wraps rather than running off the card — a raw provider error can be long. */}
                  {/* line-clamp + title: a raw provider error ("(#131049) message failed to send:
                      ...") is long enough to stretch the row taller than the whole table and push
                      the action column off the card. Two lines here, the full text on hover. */}
                  {l.providerError && (
                    <p
                      title={l.providerError}
                      className="mt-1 line-clamp-2 max-w-[8rem] whitespace-normal break-words text-xs leading-snug text-muted-foreground"
                    >
                      {reasonText(l.providerError)}
                    </p>
                  )}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{formatDateStamp(l.createdAt)}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableEmpty colSpan={canRetry ? 8 : 7}>
                <EmptyState icon={BellOff} title={emptyTitle} description={emptyText} />
              </TableEmpty>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const NOTIFICATION_LIMIT = 100;

export default async function NotificationsPage() {
  const user = await requireCompanyUser();
  // Same honesty problem the activity log had: 100 rows, no word about the rest.
  const [logs, totalLogs] = await Promise.all([
    prisma.notificationLog.findMany({
      where: { companyId: user.companyId! },
      include: { shipment: true },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_LIMIT,
    }),
    prisma.notificationLog.count({ where: { companyId: user.companyId! } }),
  ]);

  // Same data, two views: rows that actually need a human's attention vs. the full send history.
  const needsAttention = logs.filter((l) => l.status === "FAILED" || l.status === "SKIPPED");
  // Counted apart because they ask for different work: a failure is a retry, a skip is a data or
  // configuration fix. One combined number would hide which of the two the employee is looking at.
  const failedCount = needsAttention.filter((l) => l.status === "FAILED").length;
  const skippedCount = needsAttention.length - failedCount;
  const canRetry = can(user, "shipments", "updateStatus");

  return (
    <div className="space-y-4">
      <PageHeader title="الإشعارات" description="رسائل واتساب المُرسلة للمرسِلين والمستلمين" />

      <Tabs defaultValue="center" dir="rtl">
        <TabsList>
          {/* The count on this tab is the same FAILED-only number the topbar bell shows. It used to be
              FAILED + SKIPPED, so the bell said 1 while the tab said (2) — two different answers to
              "what needs my attention" on one screen. SKIPPED is still listed and still counted, in
              its own chip below, where it reads as context rather than as a task. */}
          <TabsTrigger value="center">مركز الإشعارات {failedCount > 0 && `(${failedCount})`}</TabsTrigger>
          <TabsTrigger value="log">سجل الإرسال</TabsTrigger>
        </TabsList>
        <TabsContent value="center" className="space-y-3 pt-3">
          {needsAttention.length > 0 && (
            <div className="flex flex-wrap gap-2 text-sm" data-testid="notification-counts">
              <span className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-destructive">
                فشلت: {failedCount}
              </span>
              <span className="rounded-lg border px-3 py-1.5 text-muted-foreground">متخطاة: {skippedCount}</span>
            </div>
          )}
          <NotificationTable logs={needsAttention} emptyTitle="كل الرسائل وصلت" emptyText="لا توجد رسائل فشلت أو تُخطّيت — لا شيء يحتاج انتباهك هنا الآن." canRetry={canRetry} />
        </TabsContent>
        <TabsContent value="log" className="space-y-2 pt-3">
          <NotificationTable logs={logs} emptyTitle="لا توجد رسائل بعد" emptyText="تُرسَل رسائل واتساب تلقائياً عند تسجيل الشحنات ووصولها وتسليمها، وتظهر هنا." canRetry={canRetry} />
          {totalLogs > logs.length && (
            <p className="text-xs text-muted-foreground">
              يعرض أحدث {logs.length.toLocaleString("en-US")} رسالة من أصل {totalLogs.toLocaleString("en-US")}.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
