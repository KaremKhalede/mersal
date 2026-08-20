"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { submitPaymentAction } from "./actions";

/**
 * Reports a payment toward an invoice — it does NOT settle it. The platform reviews the proof and
 * confirms or rejects; only then does the invoice balance move.
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
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Called as the form's action, so closing the dialog happens in an event handler rather than in
  // an effect reacting to action state (which cascades renders).
  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await submitPaymentAction({}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("تم إرسال الدفعة — بانتظار مراجعة المنصة");
      setOpen(false);
      setFileName(null);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Send className="h-4 w-4" /> الإبلاغ عن دفعة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={onSubmit} className="space-y-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <DialogHeader>
            <DialogTitle>الإبلاغ عن دفعة</DialogTitle>
            <DialogDescription>
              الفاتورة <span dir="ltr">{invoiceNumber}</span> — المتبقي {remaining.toLocaleString()} ر.ي.
              ستراجع المنصة الدفعة قبل اعتمادها.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإرسال..." : "إرسال للمراجعة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
