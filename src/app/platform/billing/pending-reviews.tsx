"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { confirmPaymentAction, rejectPaymentAction } from "./review-actions";
import { formatYER } from "@/lib/money";

export type PendingRow = {
  id: string;
  amount: number;
  method: string;
  methodLabel: string;
  reference: string | null;
  note: string | null;
  hasProof: boolean;
  createdAt: string;
  companyName: string;
  companySlug: string;
  logoColor: string;
  invoiceNumber: string;
  invoiceTotal: number;
  invoiceRemaining: number;
  paidAt: string | null;
};

/**
 * The review queue: "هل هذا الإثبات صحيح؟". Confirming appends the SETTLEMENT ledger row; rejecting
 * writes nothing to the ledger and returns a reason to the company.
 */
export function PendingReviews({ rows }: { rows: PendingRow[] }) {
  const [confirming, startConfirm] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<PendingRow | null>(null);

  // Run the actions from form handlers rather than reacting to action state in an effect, so the
  // dialog close is an event-driven setState instead of a cascading render.
  function confirmAction(formData: FormData) {
    startConfirm(async () => {
      const r = await confirmPaymentAction({}, formData);
      if (r.error) toast.error(r.error);
      else if (r.success) toast.success(r.success);
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Clock className="h-4 w-4 text-warning" />
        دفعات بانتظار المراجعة
        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-2xs tabular-nums text-warning">{rows.length}</span>
      </h2>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: r.logoColor }}
              aria-hidden="true"
            >
              <FileText className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{r.companyName}</p>
              <p className="truncate text-2xs text-muted-foreground">
                <span dir="ltr">{r.invoiceNumber}</span> · إجمالي الفاتورة {formatYER(r.invoiceTotal, 2)} · {r.createdAt}
              </p>
            </div>

            {/* Claimed vs still owed, side by side — the reviewer's actual question. */}
            <div className="text-sm">
              <p className="font-bold tabular-nums">{formatYER(r.amount, 2)}</p>
              <p className="text-2xs text-muted-foreground tabular-nums">
                المتبقي على الفاتورة {formatYER(r.invoiceRemaining, 2)}
              </p>
            </div>

            <div className="text-2xs text-muted-foreground">
              <p>{r.methodLabel}{r.reference ? ` · ${r.reference}` : ""}</p>
              <p>{r.paidAt ? `دُفعت في ${r.paidAt}` : `أُبلغ في ${r.createdAt}`}</p>
              {r.amount > r.invoiceRemaining && (
                <p className="font-medium text-destructive">المبلغ المبلغ عنه يتجاوز المتبقي</p>
              )}
            </div>

            {r.hasProof ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/payment-proof/${r.id}`} target="_blank" rel="noopener noreferrer">
                  <FileText className="h-4 w-4" /> عرض الإثبات
                </a>
              </Button>
            ) : (
              <span className="text-2xs text-muted-foreground">بدون إثبات</span>
            )}

            <form action={confirmAction}>
              <input type="hidden" name="submissionId" value={r.id} />
              <Button type="submit" size="sm" disabled={confirming}>
                <Check className="h-4 w-4" /> تأكيد
              </Button>
            </form>

            <Button variant="outline" size="sm" onClick={() => setRejectTarget(r)}>
              <X className="h-4 w-4" /> رفض
            </Button>
          </li>
        ))}
      </ul>

      {/* Controlled: opened from a per-row button that lives outside this dialog. FormDialog (not a
          hand-rolled <form action>) because the rejection reason is required — a rejected reject
          used to clear the very text the reviewer had just written. */}
      <FormDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title="رفض الدفعة"
        description={rejectTarget ? `${rejectTarget.companyName} — ${formatYER(rejectTarget.amount, 2)}` : ""}
        submitLabel="تأكيد الرفض"
        submitVariant="destructive"
        successMessage="تم رفض الدفعة"
        action={(formData) => rejectPaymentAction({}, formData)}
      >
        <input type="hidden" name="submissionId" value={rejectTarget?.id ?? ""} />
        <div className="space-y-1.5">
          <Label htmlFor="reason">سبب الرفض</Label>
          <Input id="reason" name="reason" required placeholder="يظهر للشركة" />
        </div>
      </FormDialog>

    </section>
  );
}
