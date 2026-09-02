"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shell/form-dialog";
import { Pencil } from "lucide-react";
import { updateShipmentAction } from "../actions";

type Shipment = {
  id: string;
  receiverName: string;
  receiverPhone: string;
  goodsType: string | null;
  weightKg: number | null;
  notes: string | null;
};

/** Only offered for DRAFT/REGISTERED shipments (see ShipmentActions) — before a trip, customs
 * case, or payment exists, receiver/goods/price details can still be safely corrected. */
export function EditShipmentDialog({ shipment, open, onOpenChange }: { shipment: Shipment; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={open === undefined ? <Button size="sm" variant="outline"><Pencil className="h-4 w-4" /> تعديل</Button> : undefined}
      title="تعديل بيانات الشحنة"
      action={updateShipmentAction}
      submitLabel="حفظ التعديلات"
    >
      <input type="hidden" name="shipmentId" value={shipment.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="receiverName">اسم المستلم</Label>
          <Input id="receiverName" name="receiverName" defaultValue={shipment.receiverName} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receiverPhone">جوال المستلم</Label>
          <Input id="receiverPhone" name="receiverPhone" dir="ltr" defaultValue={shipment.receiverPhone} required />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="goodsType">نوع البضاعة</Label>
          <Input id="goodsType" name="goodsType" defaultValue={shipment.goodsType ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weightKg">الوزن (كجم)</Label>
          <Input id="weightKg" name="weightKg" type="number" min={0} defaultValue={shipment.weightKg ?? ""} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">ملاحظات</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={shipment.notes ?? ""} />
      </div>
    </FormDialog>
  );
}
