import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform } from "@/lib/rbac";
import {
  platformBillingCompanyDetail,
  listCompanySubmissions,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SUBMISSION_STATUS_LABELS,
  type PaymentStatus,
  type SubmissionStatus,
} from "@/modules/billing/service";
import { GenerateInvoiceButton } from "../generate-invoice-button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { monthValue, parseMonth, monthLabel } from "@/components/platform/month-options";
import { formatBusinessDate } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/page-header";
import { formatAmount, formatYER } from "@/lib/money";

const money = (n: number) => formatAmount(n, 2);

const STATUS_STYLES: Record<PaymentStatus, string> = {
  PAID: "border-success/30 bg-success/15 text-success",
  PARTIAL: "border-warning/30 bg-warning/15 text-warning",
  UNPAID: "border-destructive/30 bg-destructive/10 text-destructive",
};

const SUBMISSION_STYLES: Record<SubmissionStatus, string> = {
  PENDING: "border-warning/30 bg-warning/15 text-warning",
  CONFIRMED: "border-success/30 bg-success/15 text-success",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  UNPAID: "غير مدفوعة",
  PAID: "مدفوعة",
  CANCELLED: "ملغاة",
};

function Figure({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold leading-none tabular-nums", tone)}>{value}</p>
      {unit && <p className="mt-1 text-2xs text-muted-foreground">{unit}</p>}
    </div>
  );
}

export default async function PlatformBillingCompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "billing", "view");
  const { companyId } = await params;
  const sp = await searchParams;

  const now = new Date();
  const selected = parseMonth(sp.month, new Date(now.getFullYear(), now.getMonth(), 1));
  const selectedValue = monthValue(selected);

  const [data, submissions] = await Promise.all([
    platformBillingCompanyDetail(companyId, selected),
    listCompanySubmissions(companyId),
  ]);
  if (!data) notFound();

  // The history must reconcile with the "المحصل" figure above, which is a pure ledger sum. So the
  // confirmed rows come from the ledger (including settlements predating this workflow, which have
  // no submission), enriched with method/reference when a submission is linked. Pending and
  // rejected claims are appended separately — by definition they have no ledger row.
  const submissionByLedgerId = new Map(
    submissions.filter((s) => s.ledgerEntryId).map((s) => [s.ledgerEntryId as string, s])
  );
  const confirmedRows = data.payments.map((p) => {
    const linked = submissionByLedgerId.get(p.id);
    return {
      key: p.id,
      date: p.createdAt,
      invoiceNumber: linked?.invoice.invoiceNumber ?? null,
      amount: p.amount,
      method: linked?.method ?? null,
      reference: linked?.reference ?? p.note ?? null,
      status: "CONFIRMED" as SubmissionStatus,
      rejectionReason: null as string | null,
      proofId: linked?.proofKey ? linked.id : null,
    };
  });
  const openRows = submissions
    .filter((s) => s.status !== "CONFIRMED")
    .map((s) => ({
      key: s.id,
      date: s.createdAt,
      invoiceNumber: s.invoice.invoiceNumber,
      amount: s.amount,
      method: s.method,
      reference: s.reference,
      status: s.status as SubmissionStatus,
      rejectionReason: s.rejectionReason,
      proofId: s.proofKey ? s.id : null,
    }));
  const paymentRows = [...openRows, ...confirmedRows];

  const backHref = `/platform/billing?month=${selectedValue}`;

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={data.company.name}
        description={`${data.company.slug} · ${monthLabel(selected)}`}
        badge={
          <Badge variant="outline" className={cn("text-sm", STATUS_STYLES[data.status])}>
            {PAYMENT_STATUS_LABELS[data.status]}
          </Badge>
        }
        parent={{ label: "الفوترة", href: backHref }}
        actions={<GenerateInvoiceButton companyId={companyId} month={selectedValue} />}
      />

      <p className="rounded-lg border bg-muted/30 px-4 py-3 text-sm tabular-nums">
        {data.cartons.toLocaleString("en-US")} كرتون × سعر الكرتون = <span className="font-bold">{formatYER(data.due, 2)}</span>
      </p>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Figure label="المستحق" value={money(data.due)} unit="ر.ي" />
        <Figure label="المحصل" value={money(data.collected)} unit="ر.ي" tone="text-success" />
        <Figure label="المتبقي" value={money(data.remaining)} unit="ر.ي" tone={data.remaining > 0 ? "text-warning" : undefined} />
        <Figure label="نسبة التحصيل" value={`${data.rate}%`} />
      </div>

      <Card>
        <CardContent className="p-0">
          <h2 className="border-b px-4 py-3 text-sm font-bold">سجل المدفوعات</h2>
          {paymentRows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد مدفوعات في هذه الفترة</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>الفاتورة</TableHead>
                    <TableHead>المبلغ (ر.ي)</TableHead>
                    <TableHead>الطريقة</TableHead>
                    <TableHead>المرجع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الإثبات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRows.map((r) => (
                    <TableRow key={r.key} className="transition-colors hover:bg-muted/40">
                      <TableCell className="tabular-nums">{formatBusinessDate(r.date)}</TableCell>
                      <TableCell dir="ltr" className="text-sm">{r.invoiceNumber ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{money(r.amount)}</TableCell>
                      <TableCell className="text-sm">{r.method ? PAYMENT_METHOD_LABELS[r.method] ?? r.method : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground" dir="ltr">{r.reference || "—"}</TableCell>
                      <TableCell>
                        <span className="flex flex-col gap-1">
                          <Badge variant="outline" className={SUBMISSION_STYLES[r.status]}>
                            {SUBMISSION_STATUS_LABELS[r.status]}
                          </Badge>
                          {r.status === "REJECTED" && r.rejectionReason && (
                            <span className="text-2xs text-muted-foreground">{r.rejectionReason}</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.proofId ? (
                          <a
                            href={`/api/payment-proof/${r.proofId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            عرض
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <h2 className="border-b px-4 py-3 text-sm font-bold">الفواتير المرتبطة بالفترة</h2>
          {data.invoices.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد فواتير صادرة لهذه الفترة</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الفاتورة</TableHead>
                    <TableHead>الفترة</TableHead>
                    <TableHead>الإجمالي (ر.ي)</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.map((inv) => (
                    <TableRow key={inv.id} className="transition-colors hover:bg-muted/40">
                      <TableCell className="font-medium" dir="ltr">{inv.invoiceNumber}</TableCell>
                      {/* dir=ltr — the two ISO dates otherwise render end-before-start under RTL. */}
                      <TableCell className="tabular-nums text-muted-foreground" dir="ltr">
                        {formatBusinessDate(inv.periodStart)} — {formatBusinessDate(inv.periodEnd)}
                      </TableCell>
                      <TableCell className="tabular-nums">{money(inv.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={inv.status === "PAID" ? STATUS_STYLES.PAID : inv.status === "CANCELLED" ? "" : STATUS_STYLES.UNPAID}
                        >
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
