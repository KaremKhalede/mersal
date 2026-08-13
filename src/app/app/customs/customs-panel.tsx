"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMS_STATUSES, CUSTOMS_STATUS_LABELS, type CustomsStatus } from "@/lib/enums";
import { openCustomsCaseAction, updateCustomsStatusAction } from "./actions";

type CustomsCase = { id: string; status: string; notes: string | null } | null;

export function CustomsPanel({ shipmentId, customsCase }: { companyId: string; shipmentId: string; customsCase: CustomsCase }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!customsCase) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-sm text-muted-foreground">لا يوجد ملف جمركي لهذه الشحنة بعد.</p>
        <Button
          disabled={pending}
          onClick={() => startTransition(async () => { await openCustomsCaseAction(shipmentId); router.refresh(); })}
        >
          فتح ملف جمركي
        </Button>
      </div>
    );
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await updateCustomsStatusAction(customsCase!.id, shipmentId, formData);
      router.refresh();
      toast.success("تم تحديث الحالة الجمركية");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <label className="text-sm font-medium">الحالة الجمركية</label>
        <Select name="status" defaultValue={customsCase.status}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CUSTOMS_STATUSES.map((s: CustomsStatus) => (
              <SelectItem key={s} value={s}>{CUSTOMS_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">ملاحظات</label>
        <Textarea name="notes" defaultValue={customsCase.notes ?? ""} rows={3} />
      </div>
      <Button type="submit" disabled={pending}>حفظ</Button>
    </form>
  );
}
