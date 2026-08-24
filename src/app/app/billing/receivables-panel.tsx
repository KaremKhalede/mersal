import Link from "next/link";
import { ChevronLeft, Wallet, HandCoins, AlarmClock, PhoneCall, CheckCircle2 } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { EmptyState, NoResults } from "@/components/feedback/empty-state";
import { formatAmount, formatYER } from "@/lib/money";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { formatDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import {
  customerReceivables,
  collectedOnDay,
  businessToday,
  OVERDUE_AFTER_DAYS,
  type AgingKey,
  type ReceivableCustomer,
} from "@/modules/collections/service";

/**
 * CUSTOMER money — what the shipping company's own customers still owe it.
 *
 * The question this screen exists for is not "show me a ledger", it is the four words a manager
 * says out loud: **من عليه، ومنذ متى**. Everything on it is arranged to answer that in one screen
 * and hand off to the existing payment flow, which is unchanged: the balance leads, the customer
 * is the row, and opening a shipment from here lands on the shipment page where `PaymentDialog`
 * already lives. No payment is ever recorded on this screen — it is a read.
 *
 * ## Why native <details>, and no client component
 *
 * Expanding a customer to see their unpaid shipments is disclosure, not state anyone else needs.
 * `<details>/<summary>` is the platform's own control for exactly that: it works before hydration,
 * it is keyboard- and screen-reader-correct without a single aria attribute written by hand, it
 * survives with JavaScript off, and it costs zero client bytes. A `"use client"` accordion here
 * would ship a bundle to re-implement a browser feature, on the one screen a manager opens on a
 * phone at a counter with bad signal.
 *
 * ## Why the aging buckets are computed before the filter is applied
 *
 * `customerReceivables` deliberately measures the buckets over the whole population and narrows
 * only the customer list. If the chart re-measured itself after filtering, clicking "أكثر من 30
 * يوم" would leave one bucket holding 100% and the other three at zero — the control would destroy
 * the very reading that motivated the click.
 */
export async function ReceivablesPanel({
  companyId,
  branchScope,
  branchId,
  aging,
  branches,
}: {
  companyId: string;
  branchScope: string | null;
  branchId?: string;
  aging?: AgingKey;
  branches: { id: string; name: string }[];
}) {
  const today = businessToday();
  const [data, collectedToday] = await Promise.all([
    customerReceivables(companyId, { branchScope, branchId, aging }),
    collectedOnDay(companyId, today, { branchScope: branchScope ?? branchId ?? null }),
  ]);

  const baseParams = new URLSearchParams({ tab: "receivables" });
  if (branchId && !branchScope) baseParams.set("branchId", branchId);
  const hrefWithAging = (key: AgingKey | null) => {
    const p = new URLSearchParams(baseParams);
    if (key) p.set("aging", key);
    return `/app/billing?${p.toString()}`;
  };

  const filtered = Boolean(aging);
  const maxBucket = Math.max(1, ...data.aging.map((b) => b.amount));

  return (
    <div className="space-y-4">
      {/* The three figures a manager acts on. "المُحصّل اليوم" is the same derivation the daily
          close and the dashboard card use (collectedOnDay) — one definition of "collected", so the
          number here can never disagree with the till sheet one tab over. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="مستحق الآن على العملاء"
          value={formatAmount(data.outstanding)}
          unit="ر.ي"
          icon={Wallet}
          tone="warning"
          footer={<p className="text-2xs text-muted-foreground">{data.shipmentCount.toLocaleString("en-US")} شحنة غير مسددة</p>}
        />
        <StatCard
          label="المُحصّل اليوم"
          value={formatAmount(collectedToday)}
          unit="ر.ي"
          icon={HandCoins}
          tone="success"
          href={`/app/billing?tab=close&date=${today}`}
          linkLabel="من قبض اليوم؟"
        />
        <StatCard
          label={`متأخر أكثر من ${OVERDUE_AFTER_DAYS} يوم`}
          value={formatAmount(data.overdue)}
          unit="ر.ي"
          icon={AlarmClock}
          tone={data.overdue > 0 ? "destructive" : "primary"}
          footer={<p className="text-2xs text-muted-foreground">محسوب من تاريخ تسجيل الشحنة</p>}
        />
      </div>

      {/* Aging. Four segments, each a filter — a bar chart nobody can click is a picture of a
          problem; this one is the way into it. */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">تقادم المستحقات</p>
            {filtered && (
              <Link href={hrefWithAging(null)} className="text-xs font-medium text-primary hover:underline">
                عرض كل الفترات
              </Link>
            )}
          </div>
          <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {data.aging.map((bucket) => {
              const active = aging === bucket.key;
              return (
                <li key={bucket.key}>
                  <Link
                    href={hrefWithAging(active ? null : bucket.key)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-full flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/50",
                      active && "border-primary bg-primary/5"
                    )}
                  >
                    <span className="text-xs text-muted-foreground">{bucket.label}</span>
                    <span className="text-lg font-bold tabular-nums" dir="ltr">{formatAmount(bucket.amount)}</span>
                    {/* A proportion bar rather than a number-only cell: four amounts side by side
                        are hard to weigh against each other, and "which bucket is the problem" is
                        the only thing this row is asked. It is a screen affordance only — the fill
                        is a background colour, which print engines drop, so the amount and the
                        count above it carry the whole meaning on their own. Fine here and NOT fine
                        on the close sheet or the receipt, which is why neither of those documents
                        draws one. */}
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn("block h-full rounded-full", bucket.key === "30+" ? "bg-destructive" : bucket.key === "15-30" ? "bg-warning" : "bg-primary")}
                        style={{ width: `${Math.round((bucket.amount / maxBucket) * 100)}%` }}
                      />
                    </span>
                    <span className="text-2xs text-muted-foreground">{bucket.count.toLocaleString("en-US")} شحنة</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Branch filter — only for a role that can actually widen its view. A branch-scoped employee
          gets a plain statement of where they are instead of a control that cannot move. */}
      {branchScope ? null : branches.length > 1 ? (
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tab" value="receivables" />
          {aging && <input type="hidden" name="aging" value={aging} />}
          <select
            name="branchId"
            defaultValue={branchId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <Button type="submit" variant="secondary" size="sm">تصفية</Button>
        </form>
      ) : null}

      {data.customers.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            {filtered || branchId ? (
              <NoResults resetHref="/app/billing?tab=receivables" label="لا توجد مستحقات في هذه الفترة" />
            ) : (
              <EmptyState
                icon={CheckCircle2}
                title="لا توجد مستحقات على العملاء"
                description="كل شحنة لها أجرة متفق عليها تم تحصيلها بالكامل. تظهر هنا أي شحنة يتبقى عليها مبلغ."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Column labels for the disclosure rows below. Desktop only — on a phone each row
                labels its own values inline, because a header that scrolls away above a list of
                collapsed rows labels nothing. */}
            <div className="hidden items-center gap-3 border-b px-4 py-2 text-xs text-muted-foreground lg:flex">
              <span className="flex-1">العميل</span>
              <span className="w-32 text-end">المتبقي (ر.ي)</span>
              <span className="w-24 text-end">شحنات</span>
              <span className="w-32 text-end">أقدم استحقاق</span>
              <span className="w-4" />
            </div>
            <ul className="divide-y">
              {data.customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CustomerRow({ customer }: { customer: ReceivableCustomer }) {
  const overdue = customer.oldestDays > OVERDUE_AFTER_DAYS;
  const dialable = normalizePhone(customer.phone);

  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-accent [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{customer.name}</p>
            <p className="truncate text-xs text-muted-foreground" dir="ltr">{formatPhoneDisplay(customer.phone)}</p>
            {/* Phone-width echo of the three desktop columns. Same facts, one line, no table. */}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs lg:hidden">
              <span className="font-semibold text-warning tabular-nums" dir="ltr">{formatYER(customer.outstanding)}</span>
              <span className="text-muted-foreground">· {customer.shipmentCount} شحنة</span>
              <span className={cn("text-muted-foreground", overdue && "font-medium text-destructive")}>
                · أقدم: {customer.oldestDays} يوم
              </span>
            </p>
          </div>
          <span className="hidden w-32 text-end text-sm font-semibold text-warning tabular-nums lg:block" dir="ltr">
            {formatAmount(customer.outstanding)}
          </span>
          <span className="hidden w-24 text-end text-sm tabular-nums lg:block">{customer.shipmentCount}</span>
          <span className={cn("hidden w-32 text-end text-sm tabular-nums lg:block", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
            {customer.oldestDays} يوم
          </span>
          {/* Rotates on open — the only affordance telling a first-time user the row does anything.
              ChevronLeft is "forward" in RTL, same convention as PageHeader. */}
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:-rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        </summary>

        <div className="space-y-2 border-t bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {customer.deliveredUnpaid > 0 && (
              // The sharpest fact on the screen: the goods have already left the building and the
              // money has not arrived. It is a different kind of debt from one on cargo the company
              // still physically holds, so it is said out loud rather than left for the reader to
              // spot by scanning status badges.
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                {customer.deliveredUnpaid} شحنة سُلّمت وغير مسددة
              </Badge>
            )}
            <Badge variant="outline" className="text-muted-foreground">
              أقدم استحقاق: {formatDate(customer.oldestAt)}
            </Badge>
            {dialable && (
              // The next action on an overdue balance is a phone call, and the number is right
              // here. `tel:` rather than a WhatsApp deep link: this is the office calling its own
              // customer, and every phone can place a call.
              <Button asChild size="sm" variant="outline" className="ms-auto">
                <a href={`tel:${dialable}`} dir="ltr"><PhoneCall className="h-4 w-4" /> {formatPhoneDisplay(customer.phone)}</a>
              </Button>
            )}
          </div>

          <ul className="space-y-2">
            {customer.shipments.map((s) => (
              <li key={s.id}>
                {/* The whole row is the link, and it lands on the shipment page — which is where
                    PaymentDialog lives. Recording money stays exactly where it always was; this
                    screen only ever shortens the walk to it. */}
                <Link
                  href={`/app/shipments/${s.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card p-3 text-sm hover:border-primary/40 hover:bg-accent"
                >
                  <span className="font-medium text-primary" dir="ltr">{s.shipmentNumber}</span>
                  <ShipmentStatusBadge status={s.status} />
                  <span className="text-xs text-muted-foreground">{s.route}</span>
                  <span className="text-xs text-muted-foreground">· {s.totalCartons} كرتون</span>
                  <span className={cn("text-xs", s.ageDays > OVERDUE_AFTER_DAYS ? "font-medium text-destructive" : "text-muted-foreground")}>
                    · منذ {s.ageDays} يوم
                  </span>
                  <span className="ms-auto flex flex-wrap items-center gap-x-3 text-xs">
                    <span className="text-muted-foreground">
                      الأجرة <span dir="ltr" className="tabular-nums">{formatAmount(s.price)}</span>
                    </span>
                    <span className="text-muted-foreground">
                      المدفوع <span dir="ltr" className="tabular-nums">{formatAmount(s.paid)}</span>
                    </span>
                    <span className="font-semibold text-warning">
                      المتبقي <span dir="ltr" className="tabular-nums">{formatAmount(s.remaining)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </li>
  );
}
