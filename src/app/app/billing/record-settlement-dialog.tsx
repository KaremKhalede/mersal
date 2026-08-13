"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { CircleDollarSign } from "lucide-react";

/** Records a real payment the company made toward this invoice — see recordSettlement's docstring
 * for why this is an append-only ledger row, not an editable "paid" checkbox. Only offered for
 * invoices not already fully settled (see the "الحالة" column on the invoices table).
 * `action` is bound to this specific invoiceId by the (server-component) caller — an inline
 * "use server" closure only works when passed down as a prop from a Server Component, not when
 * defined inside a "use client" file directly. */
export function RecordSettlementDialog({
  remaining,
  action,
}: {
  remaining: number;
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  return (
    <FormDialog
      trigger={<Button size="sm" variant="outline"><CircleDollarSign className="h-4 w-4" /> تسجيل تسوية</Button>}
      title="تسجيل تسوية"
      description={`المتبقي على هذه الفاتورة: ${remaining.toLocaleString()} ر.ي`}
      action={action}
      submitLabel="تسجيل"
    >
      <div className="space-y-1.5">
        <Label htmlFor="amount">المبلغ المسدد (ر.ي)</Label>
        <Input id="amount" name="amount" type="number" min={0.01} step="0.01" required defaultValue={remaining} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">ملاحظة (اختياري)</Label>
        <Input id="note" name="note" placeholder="مرجع التحويل البنكي مثلاً" />
      </div>
    </FormDialog>
  );
}
