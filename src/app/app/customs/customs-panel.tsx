"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CUSTOMS_STATUSES, CUSTOMS_STATUS_LABELS, type CustomsStatus } from "@/lib/enums";
import { saveCustomsStatusAction } from "./actions";

type CustomsCase = { status: string; notes: string | null } | null;

/** No separate "open a customs file" step — every shipment implicitly has customs standing, so the
 * case is provisioned lazily on first save (see saveCustomsStatusAction). This is presented as one
 * more tracking control, not a sub-module of its own: saving here writes straight into the same
 * TrackingEvent timeline shown above it on the shipment page. */
export function CustomsPanel({ shipmentId, customsCase }: { shipmentId: string; customsCase: CustomsCase }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await saveCustomsStatusAction(shipmentId, formData);
      if (result?.error) { toast.error(result.error); return; }
      router.refresh();
      toast.success("تم تحديث الحالة الجمركية");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label>الحالة الجمركية</Label>
        <Select name="status" defaultValue={customsCase?.status ?? "NOT_PREPARED"}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CUSTOMS_STATUSES.map((s: CustomsStatus) => (
              <SelectItem key={s} value={s}>{CUSTOMS_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>ملاحظات</Label>
        <Textarea name="notes" defaultValue={customsCase?.notes ?? ""} rows={3} />
      </div>
      <Button type="submit" disabled={pending}>حفظ</Button>
    </form>
  );
}
