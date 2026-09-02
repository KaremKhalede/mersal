import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { listDeliveryRequests } from "@/modules/delivery/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableCellNum, TableHead, TableHeadNum, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Send, Clock, Truck, CheckCircle2 } from "lucide-react";
import { DeliveryQueueActions } from "./delivery-queue-actions";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, NoResults, TableEmpty } from "@/components/feedback/empty-state";
import { formatPhoneDisplay } from "@/lib/phone";

/**
 * The delivery queue, given the same anatomy as every other list in the product.
 *
 * It was the page that most obviously came from a different afternoon than its neighbours: a bare
 * table, no counters, no search, no status filter, no designed empty state — while the shipments
 * list one nav item above it had all four. Nothing about home delivery makes it the one queue that
 * should not be searchable; it simply never got the pass.
 *
 * The counters are the queue's own question, not decoration: how many customers are waiting for
 * someone to act, how many are already moving, how many closed today. "قيد الانتظار" is the number
 * this screen exists for, so it leads and it is the one that carries a tone.
 *
 * Filtering is done in the page rather than the query. The queue is bounded by construction — open
 * delivery requests for one company, and a branch-scoped user sees only their own branch — so this
 * is a list measured in tens, and pushing a where-clause into the service to filter tens of rows
 * would buy nothing. If it ever stops being tens, this is the comment that says where to move it.
 */
export default async function DeliveryRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const sp = await searchParams;
  const all = await listDeliveryRequests(user.companyId!, getBranchScope(user));
  const canAct = can(user, "shipments", "updateStatus");

  const q = (sp.q ?? "").trim().toLowerCase();
  const requests = all.filter((r) => {
    if (sp.status && r.status !== sp.status) return false;
    if (!q) return true;
    return (
      r.shipment.shipmentNumber.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      r.customerPhone.includes(q) ||
      r.destinationAddress.toLowerCase().includes(q)
    );
  });

  const counts = {
    pending: all.filter((r) => r.status === "PENDING").length,
    assigned: all.filter((r) => r.status === "ASSIGNED").length,
    onTheWay: all.filter((r) => r.status === "OUT_FOR_DELIVERY").length,
    delivered: all.filter((r) => r.status === "DELIVERED").length,
  };
  const filtered = Boolean(q || sp.status);
  const colSpan = canAct ? 6 : 5;

  return (
    <div className="space-y-4">
      <PageHeader title="طلبات التوصيل" count={all.length} description="طلبات التوصيل إلى المنزل الواردة من العملاء" />

      <div data-testid="delivery-counts" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="قيد الانتظار" value={counts.pending} icon={Clock} tone={counts.pending > 0 ? "warning" : "primary"} />
        <StatCard label="مؤكدة" value={counts.assigned} icon={CheckCircle2} />
        <StatCard label="قيد التوصيل" value={counts.onTheWay} icon={Truck} />
        <StatCard label="تم التوصيل" value={counts.delivered} icon={CheckCircle2} tone="success" />
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="ابحث برقم الشحنة أو اسم المستلم أو العنوان..." className="max-w-xs" />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">كل الحالات</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">تصفية</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الشحنة</TableHead>
                {/* The delivery contact — the receiver, not the sender. See DeliveryRequest in
                    prisma/schema.prisma for why these columns are named customerName/customerPhone. */}
                <TableHead>المستلم</TableHead>
                <TableHead>العنوان</TableHead>
                <TableHeadNum>الكراتين</TableHeadNum>
                <TableHead>الحالة</TableHead>
                {canAct && <TableHead>الإجراء</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/app/shipments/${r.shipmentId}`} className="font-medium text-primary hover:underline" dir="ltr">
                      {r.shipment.shipmentNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {r.customerName}
                    <span className="block text-xs text-muted-foreground" dir="ltr">{formatPhoneDisplay(r.customerPhone)}</span>
                  </TableCell>
                  {/* The one free-text column in this table. Every other cell in the product is
                      whitespace-nowrap by default, which for a full street address means one
                      unbreakable line that pushed the action column off the card. */}
                  <TableCell className="max-w-[20rem] whitespace-normal text-sm text-muted-foreground" title={r.destinationAddress}>
                    <span className="line-clamp-2">{r.destinationAddress}</span>
                  </TableCell>
                  <TableCellNum>{r.cartonCount}</TableCellNum>
                  <TableCell><Badge variant="outline">{DELIVERY_STATUS_LABELS[r.status as DeliveryStatus] ?? r.status}</Badge></TableCell>
                  {canAct && (
                    <TableCell>
                      <DeliveryQueueActions
                        requestId={r.id}
                        shipmentId={r.shipmentId}
                        status={r.status}
                        receiverName={r.shipment.receiverName}
                        missingCartonCodes={r.shipment.cartons.filter((c) => c.status === "MISSING").map((c) => c.cartonCode)}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableEmpty colSpan={colSpan}>
                  {filtered ? (
                    <NoResults resetHref="/app/delivery" />
                  ) : (
                    <EmptyState
                      icon={Send}
                      title="لا توجد طلبات توصيل"
                      // No create button: a delivery request is raised by the customer from their
                      // own tracking page, never by an employee here. Saying so is more useful than
                      // an action this screen cannot offer.
                      description="يطلب العميل التوصيل من صفحة تتبع شحنته بعد وصولها إلى الفرع، ويظهر الطلب هنا للمراجعة."
                    />
                  )}
                </TableEmpty>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
