import { getShipmentByTrackingToken } from "@/modules/shipments/service";
import { notFound } from "next/navigation";
import { CUSTOMER_TIMELINE_STEPS } from "@/lib/enums";
import { formatBusinessDateTime, formatBusinessStamp } from "@/lib/timezone";
import { Package, CheckCircle2, Circle, Truck, CalendarClock } from "lucide-react";
import { PickupOrDeliveryChoice } from "./pickup-or-delivery-choice";

export default async function TrackShipmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Keyed by the unguessable tracking token, never by shipmentNumber — see src/lib/tracking.ts.
  // An unknown token is a plain 404 with no hint that some other token would have worked.
  const shipment = await getShipmentByTrackingToken(token);
  if (!shipment) notFound();

  const currentStepIndex = CUSTOMER_TIMELINE_STEPS.findIndex((step) => step.statuses.includes(shipment.status as never));
  // Mirrors CHOOSABLE_STATUSES in this route's actions — the page must offer exactly what the
  // server will accept, or the customer taps a choice that comes back refused.
  const isArrivedStage = ["ARRIVED", "PARTIALLY_ARRIVED", "READY_FOR_PICKUP"].includes(shipment.status);
  const isDelivered = shipment.status === "DELIVERED";
  const isException = shipment.status === "EXCEPTION" || shipment.status === "CANCELLED";
  // "متى تصل شحنتي؟" is the question this page exists to answer, and until now it only answered
  // "أين هي". Shown only while the shipment is genuinely still travelling and the planned arrival
  // is still ahead — a stale past estimate is worse than none.
  const plannedArrival = shipment.tripLinks[0]?.unloadStop?.plannedArrival ?? null;
  const eta = plannedArrival && !isDelivered && !isArrivedStage && plannedArrival > new Date() ? plannedArrival : null;

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

          {eta && (
            <p className="flex items-center justify-center gap-2 rounded-lg bg-primary/5 p-3 text-center text-sm text-primary">
              <CalendarClock className="h-4 w-4 shrink-0" />
              الوصول المتوقع إلى {shipment.unloadBranch.city}:{" "}
              <span className="font-semibold">
                {formatBusinessDateTime(eta, { weekday: "long", day: "numeric", month: "long" })}
              </span>
            </p>
          )}

          {/* Says what arrived AND what the customer can do about it — the old line stated the
              shortfall and left them with no next step on their own page. */}
          {shipment.status === "PARTIALLY_ARRIVED" && (
            <p className="rounded-lg bg-warning/15 text-warning text-sm p-3 text-center">
              وصل {shipment.arrivedCartons} من أصل {shipment.totalCartons} كراتين إلى فرع {shipment.unloadBranch.city}.
              <br />
              يمكنك استلام ما وصل من الفرع أو طلب توصيله، وسنوافيك بشأن الباقي.
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

          {/* Anything staff marked customer-visible (e.g. customs clearance) — same TrackingEvent
              rows the company's own tracking timeline reads, just filtered to what's meant to be
              shown here. Doesn't replace the curated steps above, just adds real milestones under them. */}
          {shipment.trackingEvents.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">آخر التحديثات</p>
              <ul className="space-y-1.5">
                {shipment.trackingEvents.slice(-4).reverse().map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-2 text-xs">
                    <span>{ev.title}</span>
                    <span className="text-muted-foreground shrink-0">
                      {formatBusinessDateTime(ev.createdAt, { day: "numeric", month: "long" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isArrivedStage && !isDelivered && (
            <PickupOrDeliveryChoice
              token={token}
              deliveryMethod={shipment.deliveryMethod}
              hasPendingRequest={shipment.deliveryRequest?.status === "PENDING"}
            />
          )}

          {/* Driven entirely by the real DeliveryRequest row, not client-only state — a refresh
              always reflects the actual backend status. */}
          {shipment.deliveryRequest && !isDelivered && (
            <div className="rounded-lg bg-success/10 text-success text-sm p-3 text-center space-y-1 mt-2">
              {shipment.deliveryRequest.status === "OUT_FOR_DELIVERY" ? (
                <p className="font-medium">شحنتك قيد التوصيل الآن</p>
              ) : shipment.deliveryRequest.status === "PENDING" ? (
                <>
                  {/* A customer request is a request, not a dispatch — the branch reviews it first
                      (see requestDeliveryFromCustomer). Saying "confirmed" here would promise
                      something that has not happened yet. */}
                  <p className="font-medium">تم استلام طلب التوصيل</p>
                  <p>سيراجعه الفرع ويتواصل معك لتأكيد العنوان والموعد.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">تم تأكيد طلب التوصيل</p>
                  <p>سيتم التواصل معك عند بدء التوصيل.</p>
                </>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          آخر تحديث: {formatBusinessStamp(shipment.updatedAt)}
        </p>
      </div>
    </div>
  );
}
