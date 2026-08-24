"use client";

import { useRef, useState } from "react";
import { Upload, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { submitPaymentAction } from "./actions";
import { formatYER } from "@/lib/money";

/**
 * Reports a payment toward an invoice — it does NOT settle it. The platform reviews the proof and
 * confirms or rejects; only then does the invoice balance move.
 *
 * On FormDialog rather than a hand-rolled Dialog specifically because of the amount/reference/proof
 * combination: a rejected submit used to clear all of it, and re-attaching the proof file is the
 * step nobody wants to repeat.
 */
export function ReportPaymentDialog({
  invoiceId,
  invoiceNumber,
  remaining,
  disabled,
}: {
  invoiceId: string;
  invoiceNumber: string;
  remaining: number;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <FormDialog
      trigger={
        <Button disabled={disabled}>
          <Send className="h-4 w-4" /> الإبلاغ عن دفعة
        </Button>
      }
      title="الإبلاغ عن دفعة"
      description={
        <>
          الفاتورة <span dir="ltr">{invoiceNumber}</span> — المتبقي {formatYER(remaining)}.
          ستراجع المنصة الدفعة قبل اعتمادها.
        </>
      }
      submitLabel="إرسال للمراجعة"
      successMessage="تم إرسال الدفعة — بانتظار مراجعة المنصة"
      action={(formData) => submitPaymentAction({}, formData)}
      onSuccess={() => setFileName(null)}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="amount">المبلغ المدفوع</Label>
          <Input id="amount" name="amount" type="number" step="0.01" min="0.01" defaultValue={remaining || ""} required dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="method">طريقة الدفع</Label>
          <select
            id="method"
            name="method"
            defaultValue="BANK_TRANSFER"
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="BANK_TRANSFER">تحويل بنكي</option>
            <option value="CASH">نقداً</option>
            <option value="OTHER">أخرى</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="paidAt">تاريخ الدفع</Label>
          <Input id="paidAt" name="paidAt" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reference">رقم المرجع / الحوالة</Label>
          <Input id="reference" name="reference" dir="ltr" placeholder="اختياري" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="proof">إثبات الدفع</Label>
        <input
          ref={fileRef}
          id="proof"
          name="proof"
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <Button type="button" variant="outline" className="h-9 w-full justify-center" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> {fileName ?? "اختر ملفاً (PDF أو صورة)"}
        </Button>
        <p className="text-xs text-muted-foreground">الحد الأقصى 5 ميجابايت.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">ملاحظة</Label>
        <Input id="note" name="note" placeholder="اختياري" />
      </div>
    </FormDialog>
  );
}
