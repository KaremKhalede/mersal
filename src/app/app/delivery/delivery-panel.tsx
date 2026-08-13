"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Package, CheckCircle2 } from "lucide-react";
import { requestDeliveryAction, markOutForDeliveryAction, markDeliveredAction } from "./actions";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/enums";

type Shipment = {
  id: string;
  status: string;
  deliveryRequest: { id: string; status: string; destinationAddress: string; providerRef: string | null; deliveryFee: number } | null;
};

export function DeliveryPanel({ shipment }: { shipment: Shipment }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (shipment.deliveryRequest) {
    const req = shipment.deliveryRequest;
    const stepIndex = DELIVERY_STATUSES.indexOf(req.status as DeliveryStatus);
    return (
      <div className="space-y-4 max-w-md">
        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm"><span className="text-muted-foreground">مزوّد التوصيل: </span>أرشي</p>
          <p className="text-sm"><span className="text-muted-foreground">المرجع: </span><span dir="ltr">{req.providerRef}</span></p>
          <p className="text-sm"><span className="text-muted-foreground">العنوان: </span>{req.destinationAddress}</p>
          <p className="text-sm"><span className="text-muted-foreground">الحالة: </span><span className="font-medium">{DELIVERY_STATUS_LABELS[req.status as DeliveryStatus]}</span></p>
        </div>
        <div className="flex gap-2">
          {req.status === "ASSIGNED" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await markOutForDeliveryAction(req.id, shipment.id); router.refresh(); toast.success("الشحنة قيد التوصيل"); })}
            >
              <Truck className="h-4 w-4" /> بدء التوصيل
            </Button>
          )}
          {req.status === "OUT_FOR_DELIVERY" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await markDeliveredAction(req.id, shipment.id); router.refresh(); toast.success("تم تأكيد التوصيل"); })}
            >
              <CheckCircle2 className="h-4 w-4" /> تأكيد التوصيل
            </Button>
          )}
          {stepIndex >= 3 && <p className="text-sm text-success flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> اكتمل التوصيل</p>}
        </div>
      </div>
    );
  }

  if (!["ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status)) {
    return <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2"><Package className="h-4 w-4" /> التوصيل متاح بعد وصول الشحنة إلى فرع الوجهة</p>;
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await requestDeliveryAction(shipment.id, formData);
      router.refresh();
      toast.success("تم إنشاء طلب التوصيل وتسليمه لأرشي");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-md">
      <p className="text-sm text-muted-foreground">إنشاء طلب توصيل إلى المنزل — سيتم تسليم الطلب لأرشي لإتمام التوصيل الأخير.</p>
      <div className="space-y-1.5">
        <Label htmlFor="destinationAddress">عنوان التوصيل</Label>
        <Textarea id="destinationAddress" name="destinationAddress" required rows={2} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="deliveryFee">رسوم التوصيل (اختياري)</Label>
        <Input id="deliveryFee" name="deliveryFee" type="number" min={0} defaultValue={0} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">ملاحظات</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
      <Button type="submit" disabled={pending}><Truck className="h-4 w-4" /> {pending ? "جارٍ الإرسال..." : "طلب توصيل إلى المنزل"}</Button>
    </form>
  );
}
