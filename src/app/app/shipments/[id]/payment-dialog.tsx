"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shell/form-dialog";
import { Wallet } from "lucide-react";
import { recordPaymentAction } from "../actions";
import { formatYER } from "@/lib/money";

/** `open`/`onOpenChange` are for the handover flow, which opens this dialog itself once a shipment
 *  has been handed over with a balance still on it (see DeliveryProofDialog). Left undefined, the
 *  dialog behaves exactly as before: its own button, its own state. */
export function PaymentDialog({
  shipmentId,
  amountPaid,
  shippingPrice,
  open,
  onOpenChange,
}: {
  shipmentId: string;
  amountPaid: number;
  shippingPrice: number | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={open === undefined ? <Button size="sm" variant="outline"><Wallet className="h-4 w-4" /> تسجيل دفعة</Button> : undefined}
      title="تسجيل دفعة"
      description={shippingPrice != null ? `أجرة الشحن: ${formatYER(shippingPrice)} — المدفوع حالياً: ${formatYER(amountPaid)}` : `المدفوع حالياً: ${formatYER(amountPaid)}`}
      action={recordPaymentAction}
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="space-y-1.5">
        <Label htmlFor="amountPaid">إجمالي المبلغ المدفوع</Label>
        <Input id="amountPaid" name="amountPaid" type="number" min={0} defaultValue={amountPaid} required />
      </div>
      <div className="space-y-1.5">
        <Label>طريقة الدفع</Label>
        <Select name="paymentMethod" defaultValue="CASH">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="CASH">نقداً</SelectItem>
            <SelectItem value="OTHER">أخرى</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </FormDialog>
  );
}
