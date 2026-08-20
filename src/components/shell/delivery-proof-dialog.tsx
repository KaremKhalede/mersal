"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * The one handover dialog, shared by the branch counter and the delivery queue — the two places a
 * shipment can reach DELIVERED. One component because the evidence must be identical whichever way
 * the cartons left; two dialogs would drift.
 *
 * Deliberately three fields and nothing more: no signature pad, no photo upload, no ID scan. The
 * employee is standing at a counter or a doorstep with a queue behind them, and anything longer
 * than this gets skipped or faked, which is worse evidence than a name and four digits.
 *
 * `receiverName` prefills the name because the receiver collecting in person is the common case;
 * it stays editable because a relative or a driver collecting on their behalf is the case this
 * field exists to capture.
 */
export function DeliveryProofDialog({
  trigger,
  title,
  receiverName,
  missingCartonCodes = [],
  action,
}: {
  trigger?: React.ReactNode;
  title: string;
  receiverName: string;
  /** Cartons this shipment is short. Handing over what did arrive is allowed — pretending the
   *  shipment is whole is not, so the dialog says so and the confirm button changes wording. */
  missingCartonCodes?: string[];
  action: (formData: FormData) => Promise<{ error?: string; [key: string]: unknown } | void>;
}) {
  const isShort = missingCartonCodes.length > 0;

  return (
    <FormDialog
      trigger={trigger ?? <Button size="sm"><CheckCircle2 className="h-4 w-4" /> {title}</Button>}
      title={title}
      description="سجّل من استلم الشحنة فعلياً — يُطلب عند أي نزاع لاحق."
      submitLabel={isShort ? "تسليم مع نقص مؤكّد" : "تأكيد التسليم"}
      action={action}
    >
      {/* The employee has to see the shortfall before they confirm, and the button has to name what
          they are actually doing — "تسليم" on a shipment that is a carton light is how a shortage
          gets signed off without anyone noticing they signed it. */}
      {isShort && (
        <div className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            يوجد {missingCartonCodes.length} كرتون مفقود. يمكنك تسليم الشحنة مع تسجيل النقص.
          </p>
          <p dir="ltr" className="text-xs">{missingCartonCodes.join("، ")}</p>
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="receivedByName">اسم المستلم الفعلي</Label>
        <Input id="receivedByName" name="receivedByName" defaultValue={receiverName} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="last4">آخر 4 أرقام من جوال المستلم</Label>
        {/* inputMode numeric, not type=number: a leading-zero suffix must survive, and the spinner
            arrows a number input adds are meaningless for 4 digits. maxLength keeps the counter
            from typing a whole phone number by reflex. */}
        <Input id="last4" name="last4" inputMode="numeric" maxLength={4} dir="ltr" placeholder="4567" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="deliveryNote">ملاحظة (اختياري)</Label>
        <Input id="deliveryNote" name="deliveryNote" placeholder="مثال: استلمها ابن العميل" />
      </div>
    </FormDialog>
  );
}
