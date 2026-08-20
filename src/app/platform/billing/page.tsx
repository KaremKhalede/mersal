import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform, canPlatform } from "@/lib/rbac";
import {
  platformBillingTotals,
  platformBillingByCompany,
  listPendingSubmissions,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type PaymentStatus,
} from "@/modules/billing/service";
import { PendingReviews } from "./pending-reviews";
import { formatBusinessDate } from "@/lib/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { MonthPicker } from "@/components/platform/month-picker";
import { monthOptions, monthValue, parseMonth, MONTH_NAMES } from "@/components/platform/month-options";
import { BillingToolbar } from "./billing-toolbar";
import { Package, Receipt, Wallet, CircleAlert, TrendingUp, TrendingDown, CalendarRange, Building2, Info, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString("en-US");

const STATUS_STYLES: Record<PaymentStatus, string> = {
  PAID: "border-success/30 bg-success/15 text-success",
  PARTIAL: "border-warning/30 bg-warning/15 text-warning",
  UNPAID: "border-destructive/30 bg-destructive/10 text-destructive",
};

function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  tone,
  footer,
  delay,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  footer: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="animate-in rounded-xl border bg-card p-4 shadow-sm fade-in slide-in-from-bottom-3 duration-500 transition-all [animation-fill-mode:backwards] hover:-translate-y-0.5 hover:shadow-md motion-reduce:animate-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{unit}</p>
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3">{footer}</div>
    </div>
  );
}

/** Collection bar — built inline rather than with ui/progress, whose Radix indicator translates on
 *  the X axis and therefore fills from the wrong edge under RTL. */
function CollectionBar({ rate }: { rate: number }) {
  const clamped = Math.min(100, Math.max(0, rate));
  const tone = clamped >= 100 ? "bg-success" : clamped > 0 ? "bg-warning" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-xs font-semibold tabular-nums">{clamped}%</span>
      <div
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="نسبة التحصيل"
      >
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string; status?: string; page?: string; pageSize?: string }>;
}) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "billing", "view");
  const sp = await searchParams;

  const now = new Date();
  const months = monthOptions(now);
  const selected = parseMonth(sp.month, new Date(now.getFullYear(), now.getMonth(), 1));
  const selectedValue = monthValue(selected);
  const search = sp.q?.trim() ?? "";
  const status = ["PAID", "PARTIAL", "UNPAID"].includes(sp.status ?? "") ? (sp.status as PaymentStatus) : undefined;
  const page = Math.max(Number(sp.page) || 1, 1);
  const pageSize = Number(sp.pageSize) || 10;

  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
  const range = `01 - ${monthEnd.getDate()} ${MONTH_NAMES[selected.getMonth()]} ${selected.getFullYear()}`;

  const [totals, companies, pending] = await Promise.all([
    platformBillingTotals(selected),
    platformBillingByCompany({ month: selected, search, status, page, pageSize }),
    listPendingSubmissions(),
  ]);

  // Decimal/Date are not serializable across the Server->Client boundary — flatten here.
  const pendingRows = pending.map((p) => ({
    id: p.id,
    amount: p.amount,
    method: p.method,
    methodLabel: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
    reference: p.reference,
    note: p.note,
    hasProof: Boolean(p.proofKey),
    createdAt: formatBusinessDate(p.createdAt),
    companyName: p.company.name,
    companySlug: p.company.slug,
    logoColor: p.company.logoColor,
    invoiceNumber: p.invoice.invoiceNumber,
    invoiceTotal: p.invoice.totalAmount,
    invoiceRemaining: p.invoiceRemaining,
    paidAt: p.paidAt ? formatBusinessDate(p.paidAt) : null,
  }));

  const qs = [search ? `q=${encodeURIComponent(search)}` : "", status ? `status=${status}` : ""].filter(Boolean).join("&");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight">الفوترة</h1>
          <p className="text-sm text-muted-foreground">متابعة فواتير الشركات والمبالغ المستحقة والمدفوعات</p>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Info className="h-3 w-3 shrink-0" />
            سعر الاستخدام: {money(totals.feePerCarton)} ر.ي / كرتون
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthPicker months={months} value={selectedValue} basePath="/platform/billing" />
          {/* Derived from the picked month rather than a second control that could disagree with it. */}
          <span className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
            <CalendarRange className="h-4 w-4 shrink-0" />
            {range}
          </span>
        </div>
      </header>

      {canPlatform(me, "billing", "reviewPayment") && <PendingReviews rows={pendingRows} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="إجمالي الكراتين"
          value={int(totals.cartons)}
          unit="كرتون"
          icon={Package}
          tone="bg-success/15 text-success"
          delay={0}
          footer={
            totals.cartonsChange === null ? (
              <p className="text-[11px] text-muted-foreground">لا توجد بيانات للمقارنة</p>
            ) : (
              <p className={cn("flex items-center gap-1 text-[11px] font-medium", totals.cartonsChange >= 0 ? "text-success" : "text-destructive")}>
                {totals.cartonsChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span className="tabular-nums">{totals.cartonsChange >= 0 ? "+" : ""}{totals.cartonsChange}%</span>
                <span className="text-muted-foreground">عن الشهر الماضي</span>
              </p>
            )
          }
        />
        <KpiCard
          label="إجمالي المستحق"
          value={money(totals.due)}
          unit="ر.ي"
          icon={Receipt}
          tone="bg-warning/15 text-warning"
          delay={60}
          footer={
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {int(totals.cartons)} كرتون × {money(totals.feePerCarton)} ر.ي
            </p>
          }
        />
        <KpiCard
          label="تم التحصيل"
          value={money(totals.collected)}
          unit="ر.ي"
          icon={Wallet}
          tone="bg-primary/10 text-primary"
          delay={120}
          footer={
            <p className="text-[11px] font-medium text-primary">
              <span className="tabular-nums">{totals.rate}%</span>{" "}
              <span className="text-muted-foreground">من إجمالي المستحق</span>
            </p>
          }
        />
        <KpiCard
          label="المتبقي"
          value={money(totals.remaining)}
          unit="ر.ي"
          icon={CircleAlert}
          tone="bg-destructive/10 text-destructive"
          delay={180}
          footer={
            <p className="text-[11px] font-medium text-destructive">
              <span className="tabular-nums">{100 - totals.rate}%</span>{" "}
              <span className="text-muted-foreground">من إجمالي المستحق</span>
            </p>
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3">
            <h2 className="px-1 py-2.5 text-sm font-bold">استخدام الشركات</h2>
            <BillingToolbar month={selectedValue} search={search} status={status ?? ""} />
          </div>

          {companies.items.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {search || status ? "لا توجد شركات مطابقة لبحثك" : "لا يوجد استخدام مسجَّل في هذه الفترة"}
            </p>
          )}

          {companies.items.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشركة</TableHead>
                    <TableHead>الكراتين</TableHead>
                    <TableHead>المستحق (ر.ي)</TableHead>
                    <TableHead>المحصل (ر.ي)</TableHead>
                    <TableHead>المتبقي (ر.ي)</TableHead>
                    <TableHead className="w-44">نسبة التحصيل</TableHead>
                    <TableHead>حالة السداد</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.items.map((r) => (
                    <TableRow key={r.id} className="transition-colors hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                            style={{ backgroundColor: r.logoColor }}
                            aria-hidden="true"
                          >
                            <Building2 className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{r.name}</span>
                            <span className="block truncate text-[11px] text-muted-foreground" dir="ltr">{r.slug}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">{int(r.cartons)}</TableCell>
                      <TableCell className="tabular-nums">{money(r.due)}</TableCell>
                      <TableCell className="tabular-nums text-success">{money(r.collected)}</TableCell>
                      <TableCell className={cn("tabular-nums", r.remaining > 0 ? "text-warning" : "text-muted-foreground")}>
                        {money(r.remaining)}
                      </TableCell>
                      <TableCell><CollectionBar rate={r.rate} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_STYLES[r.status]}>
                          {PAYMENT_STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link
                          href={`/platform/billing/${r.id}?month=${selectedValue}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          عرض التفاصيل <ChevronLeft className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

        </CardContent>
      </Card>

      {companies.items.length > 0 && (
        <Pagination
          page={companies.page}
          pageCount={companies.pageCount}
          total={companies.total}
          itemsShown={companies.items.length}
          itemLabel="شركة"
          pageSize={companies.pageSize}
          buildHref={(p) => `/platform/billing?month=${selectedValue}&page=${p}${qs ? `&${qs}` : ""}`}
        />
      )}
    </div>
  );
}
