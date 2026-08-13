import { getShipmentByNumberPublic } from "@/modules/shipments/service";
import { notFound } from "next/navigation";
import { CUSTOMER_TIMELINE_STEPS, SHIPMENT_STATUSES, type ShipmentStatus } from "@/lib/enums";
import { Package, CheckCircle2, Circle, Truck } from "lucide-react";
import { PickupOrDeliveryChoice } from "./pickup-or-delivery-choice";

export default async function TrackShipmentPage({ params }: { params: Promise<{ shipmentNumber: string }> }) {
  const { shipmentNumber } = await params;
  const shipment = await getShipmentByNumberPublic(shipmentNumber);
  if (!shipment) notFound();

  const statusIndex = SHIPMENT_STATUSES.indexOf(shipment.status as ShipmentStatus);
  const currentStepIndex = CUSTOMER_TIMELINE_STEPS.findIndex((step) => step.statuses.includes(shipment.status as never));
  const isArrivedStage = ["ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status);
  const isDelivered = shipment.status === "DELIVERED";
  const isException = shipment.status === "EXCEPTION" || shipment.status === "CANCELLED";

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4" dir="rtl">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">{shipment.company.name}</p>
        </div>

        <div className="rounded-2xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold" dir="ltr">{shipment.shipmentNumber}</h1>
            <span className="text-sm text-muted-foreground">{shipment.loadBranch.city} ← {shipment.unloadBranch.city}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-lg font-bold">{shipment.totalCartons}</p>
              <p className="text-xs text-muted-foreground">إجمالي الكراتين</p>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <p className="text-lg font-bold">{shipment.arrivedCartons}</p>
              <p className="text-xs text-muted-foreground">كراتين واصلة</p>
            </div>
          </div>

          {shipment.status === "PARTIALLY_ARRIVED" && (
            <p className="rounded-lg bg-warning/15 text-warning text-sm p-3 text-center">
              وصل {shipment.arrivedCartons} من أصل {shipment.totalCartons} كراتين.
            </p>
          )}

          {isException && (
            <p className="rounded-lg bg-destructive/10 text-destructive text-sm p-3 text-center">
              هناك ملاحظة على شحنتك — يرجى التواصل مع {shipment.company.name}.
            </p>
          )}

          <ol className="space-y-4 pt-2">
            {CUSTOMER_TIMELINE_STEPS.map((step, i) => {
              const done = i < currentStepIndex || isDelivered;
              const current = i === currentStepIndex && !isDelivered;
              return (
                <li key={step.key} className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : current ? (
                    <Truck className="h-5 w-5 text-primary shrink-0 animate-pulse" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className={done || current ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
                </li>
              );
            })}
          </ol>

          {isArrivedStage && !isDelivered && (
            <PickupOrDeliveryChoice shipmentNumber={shipment.shipmentNumber} deliveryMethod={shipment.deliveryMethod} />
          )}

          {/* Driven entirely by the real DeliveryRequest row, not client-only state — a refresh
              always reflects the actual backend status. */}
          {shipment.deliveryRequest && !isDelivered && (
            <div className="rounded-lg bg-success/10 text-success text-sm p-3 text-center space-y-1 mt-2">
              {shipment.deliveryRequest.status === "OUT_FOR_DELIVERY" ? (
                <p className="font-medium">شحنتك قيد التوصيل الآن</p>
              ) : (
                <>
                  <p className="font-medium">تم طلب التوصيل بنجاح</p>
                  <p>سيتم التواصل معك عند بدء التوصيل.</p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {statusIndex >= 0 ? "آخر تحديث: " + new Date(shipment.updatedAt).toLocaleString("ar-SA") : null}
        </p>
      </div>
    </div>
  );
}
