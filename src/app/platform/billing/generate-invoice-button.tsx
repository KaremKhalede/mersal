"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateInvoiceForCompanyAction, type ReviewState } from "./review-actions";

/** Platform-side invoice issuance for one company/month — the company can no longer bill itself. */
export function GenerateInvoiceButton({ companyId, month }: { companyId: string; month: string }) {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(generateInvoiceForCompanyAction, {});

  useEffect(() => {
    if (state.success) toast.success(state.success);
    else if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="month" value={month} />
      <Button type="submit" disabled={pending}>
        <FilePlus2 className="h-4 w-4" /> {pending ? "جارٍ الإصدار..." : "إصدار فاتورة الفترة"}
      </Button>
    </form>
  );
}
