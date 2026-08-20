import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listInvoiceCartonEntries, getCurrentPlatformFee, billingSummary } from "@/modules/billing/service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, Landmark, Boxes, Eye, ChevronDown, ChevronLeft, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";
import { formatBusinessDateTime } from "@/lib/timezone";
import { ExportInvoicesButton } from "./export-invoices-button";
import { DownloadPdfButton } from "./download-pdf-button";
import { InvoiceActionsMenu } from "./invoice-actions-menu";
import { ShipmentBreakdownTable } from "./shipment-breakdown-table";
import { ReportPaymentDialog } from "./report-payment-dialog";
import {
  SUBMISSION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  INVOICE_STATE_LABELS,
  INVOICE_STATE_STYLES,
  listCompanySubmissions,
  listCompanyInvoiceStates,
  type SubmissionStatus,
} from "@/modules/billing/service";

const INVOICE_PAGE_SIZE = 3;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; limit?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "billing", "view");
  const sp = await searchParams;
  const limit = Math.max(INVOICE_PAGE_SIZE, Number(sp.limit) || INVOICE_PAGE_SIZE);

  const [invoices, currentFee, summary, submissions] = await Promise.all([
    listCompanyInvoiceStates(user.companyId!),
    getCurrentPlatformFee(),
    billingSummary(user.companyId!),
    listCompanySubmissions(user.companyId!),
  ]);

  const selected = invoices.find((inv) => inv.id === sp.invoice) ?? invoices[0];
  const entries = selected ? await listInvoiceCartonEntries(user.companyId!, selected.id) : [];
  const visibleInvoices = invoices.slice(0, limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <div>
          <h2 className="text-xl font-bold">المالية</h2>
          <p className="text-sm text-muted-foreground">ملخص فواتير ورسوم المنصة</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportInvoicesButton />
        </div>
      </div>

      {selected ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Label keys off `state` (the derived badge everything else on this page reads), not the
              raw Invoice.status — those two disagree the moment a payment claim is pending. */}
          <StatCard
            label={`المتبقي${selected.state === "UNPAID" ? " من آخر فاتورة غير مسددة" : ""}`}
            value={`${selected.remaining.toLocaleString()} ر.ي`}
            icon={Wallet}
            tone="warning"
          />
          <StatCard label="المدفوع" value={`${selected.settled.toLocaleString()} ر.ي`} icon={CheckCircle2} tone="success" />
          <StatCard label="رسوم المنصة" value={`${selected.totalAmount.toLocaleString()} ر.ي`} icon={Landmark} tone="primary" />
          <StatCard label="الكراتين المفوترة" value={selected.cartonCount.toLocaleString()} icon={Boxes} tone="info" />
        </div>
      ) : (
        // No invoice has been generated yet this period — still surface the accrued, not-yet-
        // invoiced ledger totals instead of showing nothing at all (see billingSummary's docstring:
        // CARTON_FEE entries only, independent of any Invoice row existing).
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="رسوم المنصة (غير مفوترة بعد)" value={`${summary.totalAmount.toLocaleString()} ر.ي`} icon={Landmark} tone="primary" />
          <StatCard label="الكراتين غير المفوترة" value={summary.totalCartons.toLocaleString()} icon={Boxes} tone="info" />
        </div>
      )}

      {/* State-driven guidance: the company should know what to do next without reading a table. */}
      {selected?.state === "AWAITING_REVIEW" && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary print:hidden">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            تم استلام إبلاغك بدفع {selected.pendingAmount.toLocaleString()} ر.ي وهو بانتظار مراجعة المنصة.
            لن يظهر ضمن المدفوع حتى يتم اعتماده.
          </span>
        </div>
      )}
      {selected?.state === "REJECTED" && selected.lastRejection && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive print:hidden">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            تم رفض إثبات الدفع{selected.lastRejection.reason ? `: ${selected.lastRejection.reason}` : "."} يمكنك
            إعادة الإرسال بإثبات صحيح.
          </span>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">الفواتير</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>الفترة</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>المدفوع</TableHead>
                <TableHead>المتبقي</TableHead>
                <TableHead>حالة الفاتورة</TableHead>
                <TableHead className="print:hidden"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleInvoices.map((inv) => {
                const isSelected = inv.id === selected?.id;
                return (
                  <TableRow key={inv.id} className={isSelected ? "bg-primary/5 hover:bg-primary/10" : ""}>
                    <TableCell>
                      <ChevronLeft className={isSelected ? "h-4 w-4 text-primary" : "h-4 w-4 text-transparent"} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/app/billing?invoice=${inv.id}`} className="font-medium text-primary hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatBusinessDateTime(inv.periodStart, { day: "numeric", month: "long" })} – {formatBusinessDateTime(inv.periodEnd, { day: "numeric", month: "long", year: "numeric" })}
                    </TableCell>
                    <TableCell>{inv.cartonCount.toLocaleString()}</TableCell>
                    <TableCell>{inv.totalAmount.toLocaleString()} ر.ي</TableCell>
                    <TableCell className="text-success">{inv.settled.toLocaleString()} ر.ي</TableCell>
                    <TableCell className={inv.remaining > 0 ? "text-warning" : ""}>{inv.remaining.toLocaleString()} ر.ي</TableCell>
                    <TableCell><Badge variant="outline" className={INVOICE_STATE_STYLES[inv.state]}>{INVOICE_STATE_LABELS[inv.state]}</Badge></TableCell>
                    <TableCell className="print:hidden">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/app/billing?invoice=${inv.id}`}><Eye className="h-4 w-4" /> عرض الفاتورة</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {invoices.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">لا توجد فواتير بعد</TableCell></TableRow>}
            </TableBody>
          </Table>
          {invoices.length > visibleInvoices.length && (
            <div className="border-t p-2 print:hidden">
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href={`/app/billing?invoice=${selected?.id ?? ""}&limit=${limit + INVOICE_PAGE_SIZE}`}>
                  عرض المزيد <ChevronDown className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">
                تفاصيل الفاتورة {selected.invoiceNumber}
                <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                  {formatBusinessDateTime(selected.periodStart, { day: "numeric", month: "long", year: "numeric" })} – {formatBusinessDateTime(selected.periodEnd, { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <SummaryRow label="إجمالي الكراتين" value={`${selected.cartonCount.toLocaleString()} كرتون`} />
              <SummaryRow label="سعر الكرتون" value={`${(entries[0]?.feePerCarton ?? currentFee).toLocaleString()} ر.ي`} />
              <SummaryRow label="إجمالي الرسوم" value={`${selected.totalAmount.toLocaleString()} ر.ي`} />
              <SummaryRow label="المدفوع" value={`${selected.settled.toLocaleString()} ر.ي`} valueClassName="text-success" />
              <SummaryRow label="المتبقي" value={`${selected.remaining.toLocaleString()} ر.ي`} valueClassName={selected.remaining > 0 ? "text-warning" : ""} />
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm text-muted-foreground">حالة الفاتورة</span>
                <Badge variant="outline" className={INVOICE_STATE_STYLES[selected.state]}>
                  {INVOICE_STATE_LABELS[selected.state]}
                </Badge>
              </div>
              <div className="flex items-center gap-2 pt-2 print:hidden">
                {selected.state !== "PAID" && selected.state !== "CANCELLED" && (
                  <ReportPaymentDialog
                    invoiceId={selected.id}
                    invoiceNumber={selected.invoiceNumber}
                    remaining={selected.remaining}
                    disabled={selected.state === "AWAITING_REVIEW"}
                  />
                )}
                <DownloadPdfButton />
                <InvoiceActionsMenu invoiceNumber={selected.invoiceNumber} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">تفاصيل الكراتين حسب الشحنات</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ShipmentBreakdownTable entries={entries} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="print:hidden">
        <CardHeader><CardTitle className="text-base">سجل المدفوعات</CardTitle></CardHeader>
        <CardContent className="p-0">
          {submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لم تُبلّغ عن أي دفعة بعد</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead>
                  <TableHead>الفاتورة</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>الطريقة</TableHead>
                  <TableHead>المرجع</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatBusinessDateTime(s.createdAt, { day: "numeric", month: "long", year: "numeric" })}
                    </TableCell>
                    <TableCell dir="ltr" className="text-sm">{s.invoice.invoiceNumber}</TableCell>
                    <TableCell>{s.amount.toLocaleString()} ر.ي</TableCell>
                    <TableCell className="text-sm">{PAYMENT_METHOD_LABELS[s.method] ?? s.method}</TableCell>
                    <TableCell className="text-sm text-muted-foreground" dir="ltr">{s.reference || "—"}</TableCell>
                    <TableCell>
                      <SubmissionBadge status={s.status as SubmissionStatus} reason={s.rejectionReason} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const SUBMISSION_BADGE_STYLES: Record<SubmissionStatus, string> = {
  PENDING: "border-warning/30 bg-warning/15 text-warning",
  CONFIRMED: "border-success/30 bg-success/15 text-success",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
};

function SubmissionBadge({ status, reason }: { status: SubmissionStatus; reason?: string | null }) {
  return (
    <span className="flex flex-col gap-0.5">
      <Badge variant="outline" className={SUBMISSION_BADGE_STYLES[status]}>
        {SUBMISSION_STATUS_LABELS[status]}
      </Badge>
      {status === "REJECTED" && reason && (
        <span className="text-[11px] text-muted-foreground">{reason}</span>
      )}
    </span>
  );
}

function SummaryRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${valueClassName ?? ""}`}>{value}</span>
    </div>
  );
}
