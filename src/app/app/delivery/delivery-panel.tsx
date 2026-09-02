"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Truck, Package, CheckCircle2, ShieldCheck, XCircle, Undo2 } from "lucide-react";
import { requestDeliveryAction, confirmDeliveryRequestAction, markOutForDeliveryAction, markDeliveredAction, failDeliveryAction, cancelDeliveryRequestAction } from "./actions";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/enums";
import { DeliveryProofDialog } from "@/components/shell/delivery-proof-dialog";

type Shipment = {
  id: string;
  status: string;
  receiverName: string;
  amountPaid: number;
  shippingPrice: number | null;
  cartons: { cartonCode: string; status: string }[];
  deliveryRequest: { id: string; status: string; destinationAddress: string; providerRef: string | null; deliveryFee: number } | null;
};

export function DeliveryPanel({ shipment }: { shipment: Shipment }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      {panel()}
    </>
  );

  function panel() {
  if (shipment.deliveryRequest) {
    const req = shipment.deliveryRequest;
    return (
      <div className="space-y-4 max-w-md">
        <div className="rounded-lg border p-4 space-y-2">
          {/* A PENDING request has not been handed to any provider yet, so naming one (or showing an
              empty reference) would be misleading — both lines appear only once it is dispatched. */}
          {req.status !== "PENDING" && (
            <>
              <p className="text-sm"><span className="text-muted-foreground">مزوّد التوصيل: </span>أرشي</p>
              <p className="text-sm"><span className="text-muted-foreground">المرجع: </span><span dir="ltr">{req.providerRef}</span></p>
            </>
          )}
          <p className="text-sm"><span className="text-muted-foreground">العنوان: </span>{req.destinationAddress}</p>
          <p className="text-sm"><span className="text-muted-foreground">الحالة: </span><span className="font-medium">{DELIVERY_STATUS_LABELS[req.status as DeliveryStatus]}</span></p>
        </div>
        {req.status === "PENDING" && (
          <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            طلب وارد من العميل عبر رابط التتبع — راجع العنوان وتواصل معه قبل التأكيد.
          </p>
        )}
        <div className="flex gap-2">
          {req.status === "PENDING" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => { const r = await confirmDeliveryRequestAction(req.id, shipment.id); if (r?.error) { toast.error(r.error); return; } router.refresh(); toast.success("تم تأكيد طلب التوصيل"); })}
            >
              <ShieldCheck className="h-4 w-4" /> مراجعة وتأكيد الطلب
            </Button>
          )}
          {req.status === "ASSIGNED" && (
            <Button
              size="sm"
              disabled={pending}
              onClick={() => startTransition(async () => { const r = await markOutForDeliveryAction(req.id, shipment.id); if (r?.error) { toast.error(r.error); return; } router.refresh(); toast.success("الشحنة قيد التوصيل"); })}
            >
              <Truck className="h-4 w-4" /> بدء التوصيل
            </Button>
          )}
          {/* Third place a handover can be confirmed from (shipment page > delivery tab) — same
              dialog, same evidence as the delivery queue and the branch counter. */}
          {req.status === "OUT_FOR_DELIVERY" && (
            <DeliveryProofDialog
              trigger={<Button size="sm" disabled={pending}><CheckCircle2 className="h-4 w-4" /> تأكيد التوصيل</Button>}
              title="تأكيد التوصيل"
              receiverName={shipment.receiverName}
              missingCartonCodes={shipment.cartons.filter((c) => c.status === "MISSING").map((c) => c.cartonCode)}
              action={(formData) => markDeliveredAction(req.id, shipment.id, formData)}
            />
          )}
          {/* Same two closes the delivery queue offers, so an employee working from the shipment
              page is never left with a request they cannot end. */}
          {(req.status === "PENDING" || req.status === "ASSIGNED") && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => startTransition(async () => { const r = await cancelDeliveryRequestAction(req.id, shipment.id); if (r?.error) { toast.error(r.error); return; } router.refresh(); toast.success("أُلغي طلب التوصيل — الشحنة متاحة للاستلام من الفرع"); })}
            >
              <Undo2 className="h-4 w-4" /> إلغاء الطلب
            </Button>
          )}
          {req.status === "OUT_FOR_DELIVERY" && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => startTransition(async () => { const r = await failDeliveryAction(req.id, shipment.id); if (r?.error) { toast.error(r.error); return; } router.refresh(); toast.success("سُجّل تعذّر التوصيل — الشحنة متاحة للاستلام من الفرع"); })}
            >
              <XCircle className="h-4 w-4" /> تعذّر التوصيل
            </Button>
          )}
          {req.status === "DELIVERED" && <p className="text-sm text-success flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> اكتمل التوصيل</p>}
          {req.status === "FAILED" && <p className="text-sm text-destructive flex items-center gap-1"><XCircle className="h-4 w-4" /> تعذّر التوصيل — الشحنة متاحة للاستلام من الفرع</p>}
          {req.status === "CANCELLED" && <p className="text-sm text-muted-foreground flex items-center gap-1"><Undo2 className="h-4 w-4" /> أُلغي الطلب — الشحنة متاحة للاستلام من الفرع</p>}
        </div>
      </div>
    );
  }

  // Exactly the states the state machine allows DELIVERY_REQUESTED from. PARTIALLY_ARRIVED belongs
  // here since P0-4: the cartons that did arrive are in the branch and can be sent on, and the
  // panel refusing what the server accepts is the same class of mismatch, only inverted.
  if (!["ARRIVED", "PARTIALLY_ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status)) {
    return <p className="text-sm text-muted-foreground text-center py-8 flex items-center justify-center gap-2"><Package className="h-4 w-4" /> التوصيل متاح بعد وصول الشحنة إلى فرع الوجهة</p>;
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const r = await requestDeliveryAction(shipment.id, formData);
      if (r?.error) { toast.error(r.error); return; }
      router.refresh();
      toast.success("تم إنشاء طلب التوصيل وإسناده لشركة التوصيل");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4 max-w-md">
      {shipment.status === "PARTIALLY_ARRIVED" && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          وصل جزء من الشحنة فقط — سيتم توصيل الكراتين الواصلة، ويبقى الناقص مسجّلاً.
        </p>
      )}
      <p className="text-sm text-muted-foreground">إنشاء طلب توصيل إلى المنزل — سيتم إسناد الطلب لشركة التوصيل لإتمام التوصيل الأخير.</p>
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
}
