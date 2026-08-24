import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PrintButton } from "@/components/labels/print-button";
import { formatDate } from "@/lib/timezone";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatAmount, toMoney, YER } from "@/lib/money";
import { deriveInvoiceState, INVOICE_STATE_LABELS, INVOICE_STATE_STYLES } from "@/modules/billing/service";
import { cn } from "@/lib/utils";

/**
 * The invoice as a document, on its own route.
 *
 * "تحميل PDF" used to be `window.print()` on /app/billing, and what came out of the printer was the
 * billing dashboard: four StatCards with icon tiles, a table of *every* invoice the company has
 * (complete with the selection chevron and the highlighted row), then the summary, then the line
 * items. The word "فاتورة" never appeared as a heading — the page opened with "الفواتير", a list of
 * other invoices.
 *
 * Worse than untidy, it did not add up. ShipmentBreakdownTable caps at five rows behind a
 * client-side "عرض جميع الشحنات" toggle with no print override, so a 45-carton / 225 ر.ي invoice
 * printed line items for 18 cartons / 90 ر.ي and a button. Nobody receiving that could reconcile it.
 *
 * A separate route rather than print rules on the billing page: that page is a dashboard by nature,
 * and turning it into a document would mean hiding ~70% of it and re-laying out the rest for a
 * column it was never designed for — a redesign of a page that is working. The trip manifest
 * already proved a dedicated A4 route produces a clean document.
 *
 * ## Why the line items are not `listInvoiceCartonEntries`
 *
 * That helper filters to `entryType: "CARTON_FEE"`, but `generateInvoice` sums *every* unbilled
 * entry in the period into `totalAmount` — no type filter. Today nothing creates an ADJUSTMENT, so
 * the two agree by luck. The moment one exists, a CARTON_FEE-only document would state a total its
 * own lines contradict, which is the exact defect this route was created to remove.
 *
 * So the lines are "every entry attached to this invoice that is not a SETTLEMENT" — settlements
 * being payments against the invoice, not charges on it. That makes `sum(lines) === totalAmount`
 * true by construction rather than by coincidence, whatever entry types exist later.
 */
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  // Same gate as the billing page. Billing is company-wide, never branch-scoped — a branch employee
  // with billing.view sees the company's invoice, same as they do on /app/billing.
  requireCan(user, "billing", "view");
  const { id } = await params;

  // companyId in the WHERE, not checked after the read: another tenant's invoice id must not even
  // resolve to a row here.
  const invoice = await prisma.invoice.findFirst({
    where: { id, companyId: user.companyId! },
    include: {
      company: true,
      entries: {
        include: { shipment: { select: { shipmentNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!invoice) notFound();

  const [platform, submissions] = await Promise.all([
    prisma.platform.findFirst(),
    prisma.paymentSubmission.findMany({
      where: { companyId: user.companyId!, invoiceId: invoice.id },
      orderBy: { createdAt: "desc" },
      select: { status: true },
    }),
  ]);

  const lines = invoice.entries.filter((e) => e.entryType !== "SETTLEMENT");
  const settled = invoice.entries
    .filter((e) => e.entryType === "SETTLEMENT")
    .reduce((sum, e) => sum + Math.abs(toMoney(e.amount)), 0);

  const totalAmount = toMoney(invoice.totalAmount);
  const linesTotal = lines.reduce((sum, e) => sum + toMoney(e.amount), 0);
  const totalCartons = lines.reduce((sum, e) => sum + e.cartonCount, 0);
  const remaining = Math.max(0, totalAmount - settled);

  // Same derivation the billing page and the platform console both read, so the badge on paper can
  // never disagree with the badge on screen.
  const state = deriveInvoiceState({
    status: invoice.status,
    totalAmount,
    settled,
    hasPending: submissions.some((s) => s.status === "PENDING"),
    lastRejected: submissions[0]?.status === "REJECTED",
  });

  const company = invoice.company;
  const issuer = platform?.name ?? "منصة الشحن";
  // Two decimals throughout the money columns: the per-carton fee is genuinely fractional (see
  // formatAmount's docstring) and a column of figures in a document has to align on the decimal
  // point. The screen keeps its shorter form; the number is identical either way.
  const money = (v: number) => formatAmount(v, 2);

  return (
    <div className="p-4 print:p-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/app/billing?invoice=${invoice.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" /> رجوع إلى المالية
        </Link>
        <PrintButton>طباعة الفاتورة</PrintButton>
      </div>

      <div
        dir="rtl"
        className="mx-auto max-w-[210mm] space-y-6 rounded-xl border bg-card p-8 print:max-w-none print:space-y-5 print:rounded-none print:border-0 print:p-0"
      >
        {/* ---- who issued it, and what it is ---------------------------------------------- */}
        {/* Deliberately no logo tile. The manifest draws one as a CSS background with white text,
            and print engines drop background graphics by default — on paper that tile is a white
            letter on white. Text identity always prints. */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-foreground/80 pb-4">
          <div className="min-w-0">
            <p className="text-lg font-bold">{issuer}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">الجهة المُصدِرة</p>
          </div>
          <div className="text-left">
            <h1 className="text-xl font-bold">فاتورة رسوم المنصة</h1>
            <p className="mt-1 font-mono text-base font-bold" dir="ltr">{invoice.invoiceNumber}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              تاريخ الإصدار: {formatDate(invoice.createdAt)}
            </p>
          </div>
        </header>

        {/* ---- the two parties and the terms ---------------------------------------------- */}
        <section className="grid grid-cols-2 gap-6 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">مُصدَرة إلى</p>
            <p className="font-bold">{company.name}</p>
            {company.address && <p className="text-muted-foreground">{company.address}</p>}
            {company.phone && <p className="text-muted-foreground" dir="ltr">{formatPhoneDisplay(company.phone)}</p>}
            {company.email && <p className="text-muted-foreground" dir="ltr">{company.email}</p>}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">تفاصيل الفاتورة</p>
            <Row label="الفترة">
              {formatDate(invoice.periodStart)}
              {" – "}
              {formatDate(invoice.periodEnd)}
            </Row>
            <Row label="الخدمة">رسوم مناولة الكراتين</Row>
            <Row label="الحالة">
              <Badge variant="outline" className={cn("border", INVOICE_STATE_STYLES[state])}>
                {INVOICE_STATE_LABELS[state]}
              </Badge>
            </Row>
          </div>
        </section>

        {/* ---- every line, never a page of them ------------------------------------------- */}
        <section>
          <p className="mb-2 text-sm font-semibold">بنود الفاتورة ({lines.length})</p>
          <div className="overflow-x-auto rounded-lg border print:overflow-visible print:rounded-none">
            <table className="w-full text-sm">
              {/* No background on the header row: `bg-muted` is a background graphic and print
                  engines drop it, leaving an unmarked header. A rule under it always prints.
                  thead is display:table-header-group by UA default, so it repeats on every page. */}
              <thead className="border-b-2 border-foreground/60">
                <tr className="text-right">
                  <th className="p-2 font-semibold">التاريخ</th>
                  <th className="p-2 font-semibold">رقم الشحنة</th>
                  <th className="p-2 text-center font-semibold">الكراتين</th>
                  <th className="p-2 text-center font-semibold">سعر الكرتون ({YER})</th>
                  <th className="p-2 text-center font-semibold">القيمة ({YER})</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((e) => (
                  <tr key={e.id} className="border-t break-inside-avoid">
                    {/* A spelled month, not "21/8/2026". Intl's ar-SA numeric form embeds U+200F
                        marks around the slashes, so the string renders as 2026/8/21 in an RTL cell
                        — day and year swapped — and forcing dir=ltr on the cell only turns it into
                        212026/8/, because the marks are inside the string, not around it. A month
                        name has no neutral separators to reorder, reads correctly in either
                        direction, and matches the الفترة line above it. */}
                    <td className="p-2 whitespace-nowrap">
                      {formatDate(e.createdAt)}
                    </td>
                    {/* An ADJUSTMENT carries no shipment and no cartons — it reads as its note
                        rather than pretending to be a carton line. */}
                    <td className="p-2" dir={e.shipment ? "ltr" : undefined}>
                      {e.shipment?.shipmentNumber ?? e.note ?? "تسوية"}
                    </td>
                    <td className="p-2 text-center tabular-nums">{e.cartonCount || "—"}</td>
                    <td className="p-2 text-center tabular-nums" dir="ltr">
                      {e.cartonCount ? money(toMoney(e.feePerCarton)) : "—"}
                    </td>
                    <td className="p-2 text-center font-medium tabular-nums" dir="ltr">{money(toMoney(e.amount))}</td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr className="border-t">
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد بنود على هذه الفاتورة</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/60 font-semibold break-inside-avoid">
                  <td className="p-2" colSpan={2}>الإجمالي</td>
                  <td className="p-2 text-center tabular-nums">{totalCartons}</td>
                  <td className="p-2" />
                  <td className="p-2 text-center tabular-nums" dir="ltr">{money(linesTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ---- what is owed ---------------------------------------------------------------- */}
        <section className="flex justify-start break-inside-avoid">
          <div className="w-full max-w-xs space-y-2 text-sm">
            <Total label="إجمالي الفاتورة" value={`${money(totalAmount)} ${YER}`} />
            <Total label="المدفوع" value={`${money(settled)} ${YER}`} />
            <div className="flex items-baseline justify-between border-t-2 border-foreground/80 pt-2">
              <span className="font-semibold">المتبقي</span>
              <span className="text-lg font-bold tabular-nums" dir="ltr">{money(remaining)} {YER}</span>
            </div>
          </div>
        </section>

        <p className="border-t pt-3 text-xs text-muted-foreground">
          هذه فاتورة رسوم تشغيلية عن خدمات منصة {issuer}، وليست فاتورة ضريبية. تُحتسب الرسوم على أساس عدد
          الكراتين المسجّلة خلال الفترة أعلاه.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="min-w-0 font-medium">{children}</span>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums" dir="ltr">{value}</span>
    </div>
  );
}
