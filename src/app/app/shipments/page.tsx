import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listShipments, shipmentStatusCounts } from "@/modules/shipments/service";
import { listBranches } from "@/modules/branches/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableCellNum, TableHead, TableHeadNum, TableHeadSort, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { StatCard } from "@/components/ui/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { PrintButton } from "@/components/labels/print-button";
import { ExportButton } from "./export-button";
import { ShipmentRowActions } from "./row-actions";
import Link from "next/link";
import { NewShipmentDialog } from "./new-shipment-dialog";
import { Package, CheckCircle2, Truck, PackageCheck, AlertTriangle } from "lucide-react";
import type { ShipmentSortDirection } from "@/modules/shipments/service";
import { formatDateStamp } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { SHIPMENT_STATUSES, SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";
import { routeLabel } from "@/lib/utils";
import { formatAmount, toMoney } from "@/lib/money";
import { EmptyState, NoResults } from "@/components/feedback/empty-state";

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; branchId?: string; page?: string; unpaid?: string; dir?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const sp = await searchParams;
  const page = Number(sp.page || 1);
  // Branch-scoped roles can never widen their view via the filter; company-wide roles may narrow
  // theirs to any one branch.
  const ownScope = getBranchScope(user);
  const effectiveBranchId = ownScope ?? (sp.branchId || undefined);
  // Set by the dashboard's "المتبقي على العملاء" figure, which links straight here.
  const unpaid = sp.unpaid === "1";
  // Anything other than the one alternative falls back to the list's long-standing default rather
  // than erroring — a hand-edited URL should reorder nothing, not break the page.
  const dir: ShipmentSortDirection = sp.dir === "asc" ? "asc" : "desc";

  const [{ items, total, pageCount }, branches, counts] = await Promise.all([
    listShipments({ companyId: user.companyId!, search: sp.q, status: sp.status as ShipmentStatus | undefined, page, branchId: effectiveBranchId, unpaid, dir }),
    listBranches(user.companyId!),
    shipmentStatusCounts(user.companyId!, effectiveBranchId),
  ]);

  const qs = `${sp.q ? `&q=${sp.q}` : ""}${sp.status ? `&status=${sp.status}` : ""}${sp.branchId ? `&branchId=${sp.branchId}` : ""}${unpaid ? "&unpaid=1" : ""}${dir === "asc" ? "&dir=asc" : ""}`;
  // Flipping the order returns to page 1: staying on page 7 of the opposite order lands the user
  // in the middle of a list they have not seen the start of.
  const sortHref = `/app/shipments?page=1${qs.replace(/&dir=asc/, "")}${dir === "asc" ? "" : "&dir=asc"}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="الشحنات"
        count={total}
        actions={
          <>
            <ExportButton status={sp.status as ShipmentStatus | undefined} search={sp.q} branchId={effectiveBranchId} unpaid={unpaid} />
            <PrintButton />
            <NewShipmentDialog branches={branches} />
          </>
        }
      />

      {/* Four counters, not five. "إجمالي الشحنات" was a lifetime total — a number to look at, not
          one to act on, and the exact thing this product already removed from the dashboard for
          that reason before growing it back here. The four that remain are each a queue someone
          works. The real total still leads the page, in the header's own count. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard label="تم التسليم" value={counts.delivered} icon={CheckCircle2} tone="success" />
        <StatCard label="في الطريق" value={counts.inTransit} icon={Truck} tone="warning" />
        <StatCard label="جاهزة للاستلام" value={counts.readyForPickup} icon={PackageCheck} />
        <StatCard label="وصول جزئي / استثناء" value={counts.needsAttention} icon={AlertTriangle} tone="destructive" />
      </div>

      <form className="flex flex-wrap gap-2 items-center print:hidden">
        <Input name="q" defaultValue={sp.q} placeholder="ابحث برقم الشحنة أو اسم العميل..." className="max-w-xs" />
        {!ownScope && (
          <select
            name="branchId"
            defaultValue={sp.branchId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">كل الحالات</option>
          {SHIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>{SHIPMENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {/* A plain checkbox, submitted by the same button as the other two filters — an unchecked
            box sends nothing, so clearing it is what drops `unpaid` from the URL. */}
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="unpaid" value="1" defaultChecked={unpaid} className="h-4 w-4 accent-primary" />
          غير مدفوعة
        </label>
        <Button type="submit" variant="secondary" size="sm">تصفية</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            sp.q || sp.status || sp.branchId || unpaid ? (
              <NoResults resetHref="/app/shipments" />
            ) : (
              <EmptyState
                icon={Package}
                title="لا توجد شحنات بعد"
                description="سجّل أول شحنة لتبدأ متابعتها من الاستلام حتى التسليم."
                action={<NewShipmentDialog branches={branches} />}
              />
            )
          ) : (
            <>
              {/* Cards below lg, table at lg and up — the same line the shell now switches on, so
                  the desktop chrome and the desktop content arrive together. (This used to be a
                  workaround: the sidebar appeared at md and took 256px, leaving a 768px screen with
                  a ~480px column, so the table had to be held back to lg while the chrome was
                  already in desktop mode. The chrome moved to lg; the split stays because eight
                  columns still do not fit a 736px phone-width page, which is what it was measuring.)
                  A card puts the number and the status on the same first line, and the card itself
                  is the action. */}
              <ul className="divide-y lg:hidden">
                {items.map((s) => (
                  <li key={s.id}>
                    <Link href={`/app/shipments/${s.id}`} className="block space-y-1 p-3 hover:bg-accent">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-primary">{s.shipmentNumber}</span>
                        <ShipmentStatusBadge status={s.status} />
                      </div>
                      <p className="text-sm">{s.customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {routeLabel(s.loadBranch.name, s.unloadBranch.name)} · {s.arrivedCartons}/{s.totalCartons} كرتون
                      </p>
                      {/* Only when something is actually owed: a settled shipment printing
                          "المتبقي: 0" on every card is noise, and a shipment with no agreed price
                          has no balance to state. */}
                      {s.shippingPrice != null && toMoney(s.shippingPrice) > toMoney(s.amountPaid) && (
                        <p className="text-xs font-medium text-warning">
                          المتبقي: {formatAmount(toMoney(s.shippingPrice) - toMoney(s.amountPaid))} ر.ي
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الشحنة</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>من ← إلى</TableHead>
                      <TableHeadNum>الكراتين</TableHeadNum>
                      <TableHead>الحالة</TableHead>
                      <TableHeadNum>المتبقي (ر.ي)</TableHeadNum>
                      <TableHeadSort href={sortHref} active direction={dir}>تاريخ الإنشاء</TableHeadSort>
                      <TableHead className="print:hidden"></TableHead>
                    </TableRow>
                  </TableHeader>
                  {/*
                    The whole row opens the shipment.

                    The shipment number stays a real anchor — it is the accessible, keyboard-
                    reachable control, and it is what a screen reader announces. `after:inset-0`
                    stretches its hit area across the positioned row, so a click anywhere on the row
                    follows that same link instead of a second click handler that would have to
                    re-implement middle-click, ctrl-click, focus and the status bar's URL preview.
                    The overflow-menu cell is positioned too, which puts it above the stretched
                    pseudo-element, so "⋯" still opens the menu rather than the shipment.
                  */}
                  <TableBody>
                    {items.map((s) => (
                      <TableRow key={s.id} className="relative">
                        <TableCell>
                          <Link
                            href={`/app/shipments/${s.id}`}
                            className="font-medium text-primary hover:underline after:absolute after:inset-0"
                          >
                            {s.shipmentNumber}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <p>{s.customer.name}</p>
                          <p className="text-xs text-muted-foreground" dir="ltr">{formatPhoneDisplay(s.customer.phone)}</p>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{routeLabel(s.loadBranch.name, s.unloadBranch.name)}</TableCell>
                        <TableCellNum dir="ltr">{s.arrivedCartons}/{s.totalCartons}</TableCellNum>
                        <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                        {/* "—" for a shipment whose price has not been agreed yet — distinct from
                            a settled "0", and the same shipments the unpaid filter leaves out. */}
                        <TableCellNum dir="ltr">
                          {s.shippingPrice == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            (() => {
                              const remaining = Math.max(0, toMoney(s.shippingPrice) - toMoney(s.amountPaid));
                              return <span className={remaining > 0 ? "font-medium text-warning" : "text-muted-foreground"}>{formatAmount(remaining)}</span>;
                            })()
                          )}
                        </TableCellNum>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatDateStamp(s.createdAt)}
                        </TableCell>
                        <TableCell className="relative print:hidden">
                          <ShipmentRowActions id={s.id} trackingToken={s.trackingToken} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemsShown={items.length}
        itemLabel="شحنة"
        buildHref={(p) => `/app/shipments?page=${p}${qs}`}
      />
    </div>
  );
}
