"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus } from "lucide-react";
import { CustomerFields } from "./customer-fields";
import { createShipmentAction } from "./actions";

export function NewShipmentDialog({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <FormDialog
      trigger={<Button><Plus className="h-4 w-4" /> شحنة جديدة</Button>}
      title="تسجيل شحنة جديدة"
      description="بيانات العميل والكراتين والأجرة في خطوة واحدة — تُنشأ الشحنة برقم فريد وسجل كرتون لكل قطعة."
      size="lg"
      action={createShipmentAction}
      onSuccess={(result) => {
        if (result && "shipmentId" in result && result.shipmentId) {
          router.push(`/app/shipments/${result.shipmentId}`);
        }
      }}
    >
      <CustomerFields />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="receiverName">اسم المستلم</Label>
          <Input id="receiverName" name="receiverName" placeholder="نفس العميل إن ترك فارغاً" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receiverPhone">جوال المستلم</Label>
          <Input id="receiverPhone" name="receiverPhone" dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label required>فرع التحميل (المنشأ)</Label>
          <Select name="loadBranchId">
            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label required>فرع التفريغ (الوجهة)</Label>
          <Select name="unloadBranchId">
            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="cartonCount" required>عدد الكراتين</Label>
          <Input id="cartonCount" name="cartonCount" type="number" min={1} defaultValue={1} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="weightKg">الوزن (كجم)</Label>
          <Input id="weightKg" name="weightKg" type="number" min={0} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="goodsType">نوع البضاعة</Label>
          <Input id="goodsType" name="goodsType" placeholder="بضاعة عامة" />
        </div>
      </div>


      <div className="space-y-1.5">
        <Label htmlFor="notes">ملاحظات</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
    </FormDialog>
  );
}
