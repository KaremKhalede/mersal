import { listInvoiceCartonEntries, getCurrentPlatformFee, billingSummary } from "@/modules/billing/service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, CheckCircle2, Landmark, Boxes, ChevronDown, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";
import { formatBusinessDateTime, formatDate } from "@/lib/timezone";
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
import { formatAmount, formatYER } from "@/lib/money";

const INVOICE_PAGE_SIZE = 3;

/**
 * PLATFORM money — what this company owes Chargee.
 *
 * Lifted verbatim out of /app/billing's page body when that page gained tabs; the invoice tables,
 * the payment-claim flow and the derived-state badges are unchanged, and this file deliberately
 * contains no customer-money figure of any kind. Its counterpart is receivables-panel.tsx, which
 * contains no platform figure. The two never import from each other.
 *
 * One real change came with the move: the invoice table lost two columns. A chevron column that
 * held nothing but a decorative caret, and an "عرض الفاتورة" button column that navigated to the
 * exact same href as the invoice number two cells away — two controls, one destination, one row.
 * The row itself is the control now.
 */
export async function PlatformFeesPanel({
  companyId,
  invoiceId,
  limit: rawLimit,
}: {
  companyId: string;
  invoiceId?: string;
  limit?: string;
}) {
  const limit = Math.max(INVOICE_PAGE_SIZE, Number(rawLimit) || INVOICE_PAGE_SIZE);

  const [invoices, currentFee, summary, submissions] = await Promise.all([
    listCompanyInvoiceStates(companyId),
    getCurrentPlatformFee(),
    billingSummary(companyId),
    listCompanySubmissions(companyId),
  ]);

  const selected = invoices.find((inv) => inv.id === invoiceId) ?? invoices[0];
  const entries = selected ? await listInvoiceCartonEntries(companyId, selected.id) : [];
  const visibleInvoices = invoices.slice(0, limit);

  const hrefFor = (id: string) => `/app/billing?tab=platform&invoice=${id}&limit=${limit}`;

  return (
    <div className="space-y-4">
      {selected ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Label keys off `state` (the derived badge everything else on this page reads), not the
              raw Invoice.status — those two disagree the moment a payment claim is pending. */}
          <StatCard
            label={`المتبقي${selected.state === "UNPAID" ? " من آخر فاتورة غير مسددة" : ""}`}
            value={formatAmount(selected.remaining)} unit="ر.ي"
            icon={Wallet}
            tone="warning"
          />
          <StatCard label="المدفوع" value={formatAmount(selected.settled)} unit="ر.ي" icon={CheckCircle2} tone="success" />
          <StatCard label="رسوم المنصة" value={formatAmount(selected.totalAmount)} unit="ر.ي" icon={Landmark} tone="primary" />
          <StatCard label="الكراتين المفوترة" value={selected.cartonCount} unit="كرتون" icon={Boxes} tone="primary" />
        </div>
      ) : (
        // No invoice has been generated yet this period — still surface the accrued, not-yet-
        // invoiced ledger totals instead of showing nothing at all (see billingSummary's docstring:
        // CARTON_FEE entries only, independent of any Invoice row existing).
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="رسوم المنصة (غير مفوترة بعد)" value={formatAmount(summary.totalAmount)} unit="ر.ي" icon={Landmark} tone="primary" />
          <StatCard label="الكراتين غير المفوترة" value={summary.totalCartons} unit="كرتون" icon={Boxes} tone="primary" />
        </div>
      )}

      {/* State-driven guidance: the company should know what to do next without reading a table. */}
      {selected?.state === "AWAITING_REVIEW" && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary print:hidden">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            تم استلام إبلاغك بدفع {formatYER(selected.pendingAmount)} وهو بانتظار مراجعة المنصة.
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
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>الفترة</TableHead>
                <TableHead>الكراتين</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>المدفوع</TableHead>
                <TableHead>المتبقي</TableHead>
                <TableHead>حالة الفاتورة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleInvoices.map((inv) => {
                const isSelected = inv.id === selected?.id;
                return (
                  <TableRow key={inv.id} className={isSelected ? "bg-primary/5 hover:bg-primary/10" : ""}>
                    <TableCell>
                      <Link href={hrefFor(inv.id)} className="font-medium text-primary hover:underline">
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatBusinessDateTime(inv.periodStart, { day: "numeric", month: "long" })} – {formatDate(inv.periodEnd)}
                    </TableCell>
                    <TableCell>{inv.cartonCount.toLocaleString()}</TableCell>
                    <TableCell>{formatYER(inv.totalAmount)}</TableCell>
                    <TableCell className="text-success">{formatYER(inv.settled)}</TableCell>
                    <TableCell className={inv.remaining > 0 ? "text-warning" : ""}>{formatYER(inv.remaining)}</TableCell>
                    <TableCell><Badge variant="outline" className={INVOICE_STATE_STYLES[inv.state]}>{INVOICE_STATE_LABELS[inv.state]}</Badge></TableCell>
                  </TableRow>
                );
              })}
              {invoices.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد فواتير بعد</TableCell></TableRow>}
            </TableBody>
          </Table>
          {invoices.length > visibleInvoices.length && (
            <div className="border-t p-2 print:hidden">
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href={`/app/billing?tab=platform&invoice=${selected?.id ?? ""}&limit=${limit + INVOICE_PAGE_SIZE}`}>
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
                  {formatDate(selected.periodStart)} – {formatDate(selected.periodEnd)}
                </p>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <SummaryRow label="إجمالي الكراتين" value={`${selected.cartonCount.toLocaleString()} كرتون`} />
              <SummaryRow label="سعر الكرتون" value={`${formatYER((entries[0]?.feePerCarton ?? currentFee))}`} />
              <SummaryRow label="إجمالي الرسوم" value={formatYER(selected.totalAmount)} />
              <SummaryRow label="المدفوع" value={formatYER(selected.settled)} valueClassName="text-success" />
              <SummaryRow label="المتبقي" value={formatYER(selected.remaining)} valueClassName={selected.remaining > 0 ? "text-warning" : ""} />
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
                <DownloadPdfButton invoiceId={selected.id} />
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
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell dir="ltr" className="text-sm">{s.invoice.invoiceNumber}</TableCell>
                    <TableCell>{formatYER(s.amount)}</TableCell>
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
    <span className="flex flex-col gap-1">
      <Badge variant="outline" className={SUBMISSION_BADGE_STYLES[status]}>
        {SUBMISSION_STATUS_LABELS[status]}
      </Badge>
      {status === "REJECTED" && reason && (
        <span className="text-2xs text-muted-foreground">{reason}</span>
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
