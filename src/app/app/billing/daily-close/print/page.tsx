import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchScope } from "@/lib/branch-scope";
import Link from "next/link";
import { ChevronRight, Banknote } from "lucide-react";
import { PrintButton } from "@/components/labels/print-button";
import { formatDate, formatBusinessTime } from "@/lib/timezone";
import { formatAmount, YER } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "@/lib/enums";
import { dailyClose, businessToday, businessDayRange } from "@/modules/collections/service";

/**
 * كشف إقفال التحصيل اليومي — the paper the drawer is counted against.
 *
 * A dedicated A4 route rather than print rules on the billing screen, for the same reason the
 * invoice document got one (see /app/billing/[id]/print): that screen is a dashboard with a tab
 * bar, three stat cards and a day picker, and turning it into a document would mean hiding most of
 * it and re-laying out the rest for a column it was never designed for.
 *
 * It follows the document language the trip manifest and the invoice already established:
 *
 *   - Identity as an OUTLINED tile with the company colour on the border and the letter, never a
 *     filled background. Print engines drop background graphics by default (Chrome's preview has
 *     them off; thermal drivers ignore CSS backgrounds outright), which would leave a white letter
 *     on white paper — the bug the manifest and the carton label both had to be fixed for.
 *   - Arabic long-form dates via formatDate — never a numeric date, whose RTL marks reorder day and
 *     year on the page (see lib/timezone.ts).
 *   - Every line item printed, never a "show more" toggle: a sheet whose rows do not sum to its own
 *     total is the exact defect the invoice document was created to remove.
 *   - Signature blocks at the foot, because a count is only evidence once a person has signed that
 *     they did it. Two: the person who counted, and whoever received the money from them.
 */
export default async function DailyClosePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireCompanyUser();
  // Same gate as /app/billing itself — a document is not a second door into the data.
  requireCan(user, "billing", "view");

  const sp = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : businessToday();
  const branchScope = getBranchScope(user);
  const close = await dailyClose(user.companyId!, day, { branchScope });

  const dayDate = businessDayRange(day).start;
  const issuedAt = formatDate(new Date());
  const scopeLabel = branchScope ? (user.branch?.name ?? "فرع") : "كل الفروع";

  return (
    <div className="p-4 print:p-0">
      <div className="print:hidden mb-4 flex items-center justify-between flex-wrap gap-2">
        <Link
          href={`/app/billing?tab=close&date=${day}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" /> رجوع إلى إقفال اليوم
        </Link>
        <PrintButton>طباعة كشف الإقفال</PrintButton>
      </div>

      <div dir="rtl" className="mx-auto max-w-[210mm] space-y-5 rounded-xl border bg-card p-6 print:max-w-none print:space-y-4 print:rounded-none print:border-0 print:p-0">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border-2 text-base font-bold"
              style={{ borderColor: user.company!.logoColor, color: user.company!.logoColor }}
            >
              {user.company!.name.trim().slice(0, 1)}
            </span>
            <div>
              <p className="font-bold">{user.company!.name}</p>
              <p className="text-xs text-muted-foreground">{scopeLabel}</p>
            </div>
          </div>
          <div className="text-left">
            <h1 className="flex items-center justify-end gap-1.5 text-lg font-bold">
              <Banknote className="h-4 w-4" /> كشف إقفال التحصيل اليومي
            </h1>
            <p className="text-xs text-muted-foreground">Daily Cash Close</p>
            <p className="text-xs text-muted-foreground mt-1">اليوم: {formatDate(dayDate)}</p>
            <p className="text-xs text-muted-foreground">تاريخ الإصدار: {issuedAt}</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">الملخص</p>
          <div className="grid grid-cols-3 gap-2">
            <Stat label={`المتوقع في الصندوق (نقداً)`} value={`${formatAmount(close.cashExpected)} ${YER}`} />
            <Stat label="تحصيل غير نقدي" value={`${formatAmount(close.other)} ${YER}`} />
            <Stat label="إجمالي التحصيل" value={`${formatAmount(close.total)} ${YER}`} />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">التحصيل حسب الموظف</p>
          {close.byEmployee.length === 0 ? (
            <p className="rounded-lg border py-6 text-center text-sm text-muted-foreground">
              لم يُسجَّل أي تحصيل في هذا اليوم
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="p-2 font-medium">الموظف</th>
                    <th className="p-2 font-medium">الفرع</th>
                    <th className="p-2 font-medium">عدد الدفعات</th>
                    <th className="p-2 font-medium">نقداً</th>
                    <th className="p-2 font-medium">غير نقدي</th>
                    <th className="p-2 font-medium">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {close.byEmployee.map((row) => (
                    <tr key={row.userId ?? "system"} className="border-t break-inside-avoid">
                      <td className="p-2 font-medium">{row.userName}</td>
                      <td className="p-2">{row.branchName ?? "على مستوى الشركة"}</td>
                      <td className="p-2 tabular-nums" dir="ltr">{row.count}</td>
                      <td className="p-2 tabular-nums" dir="ltr">{formatAmount(row.cash)}</td>
                      <td className="p-2 tabular-nums" dir="ltr">{formatAmount(row.other)}</td>
                      <td className="p-2 font-semibold tabular-nums" dir="ltr">{formatAmount(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="p-2" colSpan={2}>الإجمالي</td>
                    <td className="p-2 tabular-nums" dir="ltr">{close.events.length}</td>
                    <td className="p-2 tabular-nums" dir="ltr">{formatAmount(close.cashExpected)}</td>
                    <td className="p-2 tabular-nums" dir="ltr">{formatAmount(close.other)}</td>
                    <td className="p-2 tabular-nums" dir="ltr">{formatAmount(close.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {close.events.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">تفاصيل الدفعات ({close.events.length})</p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="p-2 font-medium">الوقت</th>
                    <th className="p-2 font-medium">رقم الشحنة</th>
                    <th className="p-2 font-medium">العميل</th>
                    <th className="p-2 font-medium">قَبَضَها</th>
                    <th className="p-2 font-medium">الطريقة</th>
                    <th className="p-2 font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {close.events.map((e) => (
                    <tr key={e.id} className="border-t break-inside-avoid">
                      <td className="p-2" dir="ltr">{formatBusinessTime(e.at)}</td>
                      <td className="p-2 font-medium" dir="ltr">{e.shipmentNumber}</td>
                      <td className="p-2">{e.customerName}</td>
                      <td className="p-2">{e.userName}</td>
                      <td className="p-2">{PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS] ?? e.method}</td>
                      <td className="p-2 font-semibold tabular-nums" dir="ltr">{formatAmount(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="p-2" colSpan={5}>إجمالي التحصيل</td>
                    <td className="p-2 tabular-nums" dir="ltr">{formatAmount(close.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-lg border p-2.5 text-sm text-muted-foreground">
          ملاحظات: هذا كشف تشغيلي لتحصيل أجور الشحن من العملاء. لا يشمل رسوم المنصة ولا أي مدفوعات
          للمنصة. المبلغ المتوقع في الصندوق هو التحصيل النقدي فقط.
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 break-inside-avoid">
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-6">قام بالجرد</p>
            <p className="text-muted-foreground">الاسم: __________________</p>
            <p className="text-muted-foreground mt-4">المبلغ المعدود: __________________</p>
            <p className="text-muted-foreground mt-4">التوقيع: __________________</p>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium mb-6">استلم المبلغ</p>
            <p className="text-muted-foreground">الاسم: __________________</p>
            <p className="text-muted-foreground mt-4">التوقيع: __________________</p>
            <p className="text-muted-foreground mt-4">التاريخ: __________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      {/* No dir="ltr" here even though the figure is a number: the string ends with the Arabic
          currency word, and forcing the whole element to LTR moves "ر.ي" to the visual left —
          printing "ر.ي 39,000" instead of "39,000 ر.ي". `tabular-nums` is what the digits actually
          needed; direction was never the fix. Same reason the trip manifest's Stat carries none. */}
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
