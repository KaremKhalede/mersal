"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Store, Truck } from "lucide-react";
import { publicRequestDeliveryAction, publicChoosePickupAction } from "./actions";

export function PickupOrDeliveryChoice({ shipmentNumber, deliveryMethod }: { shipmentNumber: string; deliveryMethod: string | null }) {
  const [mode, setMode] = useState<"choose" | "delivery-form">(deliveryMethod === "HOME_DELIVERY" ? "delivery-form" : "choose");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (deliveryMethod === "PICKUP") {
    return <p className="text-center text-sm text-success font-medium pt-2">تم اختيار الاستلام من الفرع — بانتظار زيارتك</p>;
  }

  function handleDeliverySubmit(formData: FormData) {
    startTransition(async () => {
      const result = await publicRequestDeliveryAction(shipmentNumber, formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("تم إرسال طلب التوصيل");
      router.refresh();
    });
  }

  if (mode === "delivery-form") {
    return (
      <form action={handleDeliverySubmit} className="space-y-3 pt-2 border-t">
        <p className="text-sm font-medium pt-2">عنوان التوصيل</p>
        <Textarea name="destinationAddress" required rows={2} placeholder="الحي، الشارع، أقرب معلم..." />
        <Textarea name="notes" rows={1} placeholder="ملاحظات (اختياري)" />
        <Button type="submit" className="w-full h-11" disabled={pending}>
          {pending ? "جارٍ الإرسال..." : "تأكيد طلب التوصيل"}
        </Button>
      </form>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 pt-2 border-t mt-2">
      <Button
        variant="outline"
        className="h-14 flex-col gap-1"
        disabled={pending}
        onClick={() => startTransition(async () => { await publicChoosePickupAction(shipmentNumber); router.refresh(); })}
      >
        <Store className="h-5 w-5" /> استلام من الفرع
      </Button>
      <Button className="h-14 flex-col gap-1" onClick={() => setMode("delivery-form")}>
        <Truck className="h-5 w-5" /> توصيل للمنزل
      </Button>
    </div>
  );
}
