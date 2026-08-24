import Link from "next/link";
import { Banknote, Landmark, Users, Printer, ChevronRight, ChevronLeft, Wallet } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableCellNum, TableHead, TableHeadNum, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/feedback/empty-state";
import { formatAmount } from "@/lib/money";
import { formatBusinessTime, formatDate } from "@/lib/timezone";
import { PAYMENT_METHOD_LABELS } from "@/lib/enums";
import { dailyClose, businessToday, businessDayRange } from "@/modules/collections/service";

/**
 * The calendar date `days` away from `day` (both "YYYY-MM-DD"), or null when that would land in the
 * future — which is what disables the "next day" arrow.
 *
 * Anchored at 12:00 UTC rather than at the business day's own start instant. AST midnight *is*
 * 21:00 UTC the previous day, so adding 24h to that instant and reading `.toISOString()` back
 * returns the date before the one intended — the arrows would have moved zero days forward and two
 * days back. Noon is far enough from both edges that no offset can push the UTC date across one.
 */
function shiftDay(day: string, days: number): string | null {
  const base = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return null;
  const value = new Date(base.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (businessDayRange(value).start > new Date()) return null;
  return value;
}

/**
 * إقفال اليوم — the counter's cash-up sheet.
 *
 * ## The question, in one sentence
 *
 * At the end of a shift someone counts the drawer. This screen is what they count it against:
 * who took money today, how much each person took, and what should therefore be in cash. If the
 * two numbers differ, that difference is a real event that happened in the real world, and the
 * detail table below names every payment that makes up the total so it can be found.
 *
 * ## Why it is not an accounting screen
 *
 * There is no opening float, no expenses, no deposits, no variance field, no sign-off workflow,
 * no journal. A counter needs one number to count against and a list to check it against; every
 * field beyond that is one more thing to fill in wrong at the end of a long day. The paper sheet
 * (daily-close/print) carries the signature lines, because a signature belongs on paper and a
 * "confirmed by" column in a database is not evidence of anyone having counted anything.
 *
 * ## Cash vs total
 *
 * `cashExpected` counts CASH payments only. A bank transfer collected today is real money and is
 * in `total`, but it is not in the drawer, and a figure that mixed the two could never be matched
 * against anything physical. Both are shown, side by side, labelled for what they are.
 */
export async function DailyClosePanel({
  companyId,
  branchScope,
  day,
}: {
  companyId: string;
  branchScope: string | null;
  day: string;
}) {
  const close = await dailyClose(companyId, day, { branchScope });
  const today = businessToday();
  const previous = shiftDay(day, -1);
  const next = shiftDay(day, 1);

  return (
    <div className="space-y-4">
      {/* Day picker. A native date input plus two arrows: the arrows are what gets used ("yesterday
          again"), the input is what gets used when it is the 3rd and someone is closing the 1st. */}
      <form className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value="close" />
        <div className="flex items-center gap-1">
          {previous ? (
            <Button asChild variant="outline" size="sm" aria-label="اليوم السابق">
              <Link href={`/app/billing?tab=close&date=${previous}`}><ChevronRight className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled aria-label="اليوم السابق"><ChevronRight className="h-4 w-4" /></Button>
          )}
          <input
            type="date"
            name="date"
            defaultValue={day}
            max={today}
            dir="ltr"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {/* Disabled rather than hidden on the newest day: a control that vanishes at the edge of
              its range leaves the user wondering whether they broke something. */}
          {next ? (
            <Button asChild variant="outline" size="sm" aria-label="اليوم التالي">
              <Link href={`/app/billing?tab=close&date=${next}`}><ChevronLeft className="h-4 w-4" /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled aria-label="اليوم التالي"><ChevronLeft className="h-4 w-4" /></Button>
          )}
        </div>
        <Button type="submit" variant="secondary" size="sm">عرض</Button>
        {day !== today && (
          <Link href={`/app/billing?tab=close&date=${today}`} className="text-xs font-medium text-primary hover:underline">
            العودة إلى اليوم
          </Link>
        )}
        <Button asChild variant="outline" size="sm" className="ms-auto">
          <Link href={`/app/billing/daily-close/print?date=${day}`}><Printer className="h-4 w-4" /> طباعة كشف الإقفال</Link>
        </Button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="المتوقع في الصندوق (نقداً)"
          value={formatAmount(close.cashExpected)}
          unit="ر.ي"
          icon={Banknote}
          tone="success"
          footer={<p className="text-2xs text-muted-foreground">هذا هو الرقم الذي يُطابَق مع الصندوق</p>}
        />
        <StatCard
          label="إجمالي التحصيل"
          value={formatAmount(close.total)}
          unit="ر.ي"
          icon={Wallet}
          tone="primary"
          footer={<p className="text-2xs text-muted-foreground">{close.events.length.toLocaleString("en-US")} دفعة</p>}
        />
        <StatCard
          label="تحصيل غير نقدي"
          value={formatAmount(close.other)}
          unit="ر.ي"
          icon={Landmark}
          tone="primary"
          footer={<p className="text-2xs text-muted-foreground">لا يدخل الصندوق</p>}
        />
      </div>

      {close.events.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title={`لا توجد دفعات في ${formatDate(businessDayRange(day).start)}`}
              description="لم يسجّل أي موظف تحصيلاً في هذا اليوم. يظهر هنا كل مبلغ قُبض من عملاء الشحن، ومن قبضه."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">من قبض اليوم</CardTitle></CardHeader>
            <CardContent className="p-0">
              {/* Phone: cards, not a six-column table. This is the sheet someone reads while
                  counting notes, and in a horizontally-scrolling table the money columns are
                  exactly the ones that sit off-screen — the two figures the row exists to state. */}
              <ul className="divide-y lg:hidden">
                {close.byEmployee.map((row) => (
                  <li key={row.userId ?? "system"} className="space-y-1 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{row.userName}</span>
                      <span className="font-semibold tabular-nums" dir="ltr">{formatAmount(row.total)} ر.ي</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {row.branchName ?? "على مستوى الشركة"} · {row.count} دفعة
                    </p>
                    <p className="text-xs">
                      <span className="text-success">
                        نقداً <span dir="ltr" className="tabular-nums font-medium">{formatAmount(row.cash)}</span>
                      </span>
                      {row.other !== 0 && (
                        <span className="text-muted-foreground">
                          {" · "}غير نقدي <span dir="ltr" className="tabular-nums">{formatAmount(row.other)}</span>
                        </span>
                      )}
                    </p>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 bg-muted/40 p-3 font-semibold">
                  <span>الإجمالي · {close.events.length} دفعة</span>
                  <span className="tabular-nums" dir="ltr">{formatAmount(close.total)} ر.ي</span>
                </li>
              </ul>

              <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الموظف</TableHead>
                    <TableHead>الفرع</TableHead>
                    <TableHeadNum>عدد الدفعات</TableHeadNum>
                    <TableHeadNum>نقداً (ر.ي)</TableHeadNum>
                    <TableHeadNum>غير نقدي (ر.ي)</TableHeadNum>
                    <TableHeadNum>الإجمالي (ر.ي)</TableHeadNum>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {close.byEmployee.map((row) => (
                    <TableRow key={row.userId ?? "system"}>
                      <TableCell className="font-medium">{row.userName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.branchName ?? "على مستوى الشركة"}</TableCell>
                      <TableCellNum dir="ltr">{row.count}</TableCellNum>
                      <TableCellNum dir="ltr" className="text-success">{formatAmount(row.cash)}</TableCellNum>
                      <TableCellNum dir="ltr" className="text-muted-foreground">{formatAmount(row.other)}</TableCellNum>
                      <TableCellNum dir="ltr" className="font-semibold">{formatAmount(row.total)}</TableCellNum>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="border-t bg-muted/40 font-semibold">
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2}>الإجمالي</TableCell>
                    <TableCellNum dir="ltr">{close.events.length}</TableCellNum>
                    <TableCellNum dir="ltr" className="text-success">{formatAmount(close.cashExpected)}</TableCellNum>
                    <TableCellNum dir="ltr">{formatAmount(close.other)}</TableCellNum>
                    <TableCellNum dir="ltr">{formatAmount(close.total)}</TableCellNum>
                  </TableRow>
                </tfoot>
              </Table>
              </div>
            </CardContent>
          </Card>

          {/* Only when there is more than one branch in the day's takings — a single-branch office
              would be reading its own total twice. */}
          {close.byBranch.length > 1 && (
            <Card>
              <CardHeader><CardTitle className="text-base">التحصيل حسب الفرع</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الفرع</TableHead>
                      <TableHeadNum>عدد الدفعات</TableHeadNum>
                      <TableHeadNum>نقداً (ر.ي)</TableHeadNum>
                      <TableHeadNum>الإجمالي (ر.ي)</TableHeadNum>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {close.byBranch.map((row) => (
                      <TableRow key={row.branchName}>
                        <TableCell className="font-medium">{row.branchName}</TableCell>
                        <TableCellNum dir="ltr">{row.count}</TableCellNum>
                        <TableCellNum dir="ltr" className="text-success">{formatAmount(row.cash)}</TableCellNum>
                        <TableCellNum dir="ltr" className="font-semibold">{formatAmount(row.total)}</TableCellNum>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">تفاصيل الدفعات ({close.events.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {/* Phone: one card per payment, because six columns on a 390px screen is a sideways
                  scroll at the exact moment someone is checking a total against notes in their hand. */}
              <ul className="divide-y lg:hidden">
                {close.events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/app/shipments/${e.shipmentId}`} className="block space-y-1 p-3 hover:bg-accent">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-primary" dir="ltr">{e.shipmentNumber}</span>
                        <span className="font-semibold tabular-nums" dir="ltr">{formatAmount(e.amount)} ر.ي</span>
                      </div>
                      <p className="text-sm">{e.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.userName} · {PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS] ?? e.method} ·{" "}
                        <span dir="ltr">{formatBusinessTime(e.at)}</span>
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الوقت</TableHead>
                      <TableHead>رقم الشحنة</TableHead>
                      <TableHead>العميل</TableHead>
                      <TableHead>قَبَضَها</TableHead>
                      <TableHead>الطريقة</TableHead>
                      <TableHeadNum>المبلغ (ر.ي)</TableHeadNum>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {close.events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">{formatBusinessTime(e.at)}</TableCell>
                        <TableCell>
                          <Link href={`/app/shipments/${e.shipmentId}`} className="font-medium text-primary hover:underline" dir="ltr">
                            {e.shipmentNumber}
                          </Link>
                        </TableCell>
                        <TableCell>{e.customerName}</TableCell>
                        <TableCell className="text-sm">{e.userName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS] ?? e.method}
                        </TableCell>
                        {/* A negative amount is a correction of an over-entered payment, kept
                            visible on purpose: a till that is short by it needs to show why. */}
                        <TableCellNum dir="ltr" className={e.amount < 0 ? "font-semibold text-destructive" : "font-semibold"}>
                          {formatAmount(e.amount)}
                        </TableCellNum>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
