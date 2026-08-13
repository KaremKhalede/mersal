import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listLedgerEntries, listInvoices, billingSummary, getCurrentPlatformFee } from "@/modules/billing/service";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Wallet, Boxes, FileText } from "lucide-react";
import Link from "next/link";
import { GenerateInvoiceButton } from "./generate-invoice-button";
import { RecordSettlementDialog } from "./record-settlement-dialog";
import { recordSettlementAction } from "./actions";

const ENTRY_TYPE_LABELS: Record<string, string> = { CARTON_FEE: "رسوم كرتون", SETTLEMENT: "تسوية", ADJUSTMENT: "تعديل" };

export default async function BillingPage() {
  const user = await requireCompanyUser();
  requireCan(user, "billing", "view");
  const [entries, invoices, summary, currentFee] = await Promise.all([
    listLedgerEntries(user.companyId!),
    listInvoices(user.companyId!),
    billingSummary(user.companyId!),
    getCurrentPlatformFee(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">المالية</h2>
        <GenerateInvoiceButton />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="إجمالي الرسوم" value={`${summary.totalAmount.toLocaleString()} ر.ي`} icon={Wallet} />
        <StatCard label="إجمالي الكراتين المفوترة" value={summary.totalCartons} icon={Boxes} />
        <StatCard label="سعر الكرتون" value={`${currentFee} ر.ي`} icon={FileText} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">الفواتير</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>الفترة</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>المسدد</TableHead>
                <TableHead>المستحق للمنصة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(inv.periodStart).toLocaleDateString("ar-SA")} - {new Date(inv.periodEnd).toLocaleDateString("ar-SA")}
                  </TableCell>
                  <TableCell>{inv.totalAmount.toLocaleString()} ر.ي</TableCell>
                  <TableCell className="text-success">{inv.settled.toLocaleString()} ر.ي</TableCell>
                  <TableCell className={inv.remaining > 0 ? "text-warning" : ""}>{inv.remaining.toLocaleString()} ر.ي</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={inv.status === "PAID" ? "border-success/30 bg-success/15 text-success" : ""}>
                      {inv.status === "PAID" ? "مسددة" : "غير مسددة"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.status === "UNPAID" && (
                      <RecordSettlementDialog
                        remaining={inv.remaining}
                        action={async (formData) => {
                          "use server";
                          return recordSettlementAction(inv.id, formData);
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">لا توجد فواتير بعد</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">سجل الرسوم (Ledger)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>النوع</TableHead>
                <TableHead>الشحنة</TableHead>
                <TableHead>عدد الكراتين</TableHead>
                <TableHead>سعر الكرتون</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>التاريخ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.slice(0, 50).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-muted-foreground text-sm">{ENTRY_TYPE_LABELS[e.entryType] ?? e.entryType}</TableCell>
                  <TableCell>{e.shipment ? <Link href={`/app/shipments/${e.shipment.id}`} className="text-primary hover:underline">{e.shipment.shipmentNumber}</Link> : "—"}</TableCell>
                  <TableCell>{e.cartonCount}</TableCell>
                  <TableCell>{e.feePerCarton} ر.ي</TableCell>
                  <TableCell className={`font-medium ${e.amount < 0 ? "text-success" : ""}`}>{e.amount} ر.ي</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(e.createdAt).toLocaleDateString("ar-SA")}</TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">لا توجد قيود بعد</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
