import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getTripDetail, getUnassignedShipmentsForStop } from "@/modules/trips/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShipmentStatusBadge, StopTimingBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { MapPin, Boxes, Printer, Check, ClipboardList, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AssignShipmentDialog } from "./assign-shipment-dialog";
import { StopActions } from "./stop-actions";
import type { UnloadShipment } from "@/components/shell/unload-dialog";
import { CompleteTripButton } from "./complete-trip-button";
import { stopTiming } from "@/lib/stop-timing";
import { formatBusinessDateTime } from "@/lib/timezone";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";

const STOP_STATUS_LABELS: Record<string, string> = { PENDING: "لم تصل بعد", ARRIVED: "وصلت", LOADING: "تحميل", UNLOADING: "تفريغ", DEPARTED: "غادرت", DONE: "منتهية" };

/** The unload links still pending at a stop, shaped for the confirm dialog. Cartons come from the
 *  trip query itself (getTripDetail includes them on the unload side), so opening the dialog costs
 *  no extra fetch. */
function unloadShipmentsFor(stop: {
  shipmentUnloads: { loadedAt: Date | null; unloadedAt: Date | null; shipment: { shipmentNumber: string; unloadBranch: { city: string }; cartons: { id: string; cartonIndex: number; cartonCode: string }[] } }[];
}): UnloadShipment[] {
  return stop.shipmentUnloads
    .filter((l) => l.loadedAt && !l.unloadedAt)
    .map((l) => ({
      shipmentNumber: l.shipment.shipmentNumber,
      destination: l.shipment.unloadBranch.city,
      cartons: l.shipment.cartons,
    }));
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "view");
  const { id } = await params;
  const trip = await getTripDetail(user.companyId!, id, getBranchScope(user));
  if (!trip) notFound();

  // Exactly the server's ONBOARD rule (modules/trips/service.ts): only cargo actually loaded and
  // not yet unloaded blocks completion. The two used to disagree — the button offered an action the
  // server then refused, and a shipment that was never loaded made the trip uncompletable forever.
  const remainingUnloads = trip.stops.reduce((sum, s) => sum + s.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length, 0);
  const tripClosed = trip.status === "COMPLETED";
  // Same "what's next" rule the driver app uses (src/app/driver/page.tsx) — the first stop not yet
  // wrapped up, so office staff and drivers read the route the same way.
  const currentStopId = (trip.stops.find((s) => s.status !== "DEPARTED" && s.status !== "DONE") ?? trip.stops[trip.stops.length - 1])?.id;

  return (
    <div className="space-y-4">
      <Link href="/app/trips" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-4 w-4" /> رجوع إلى الرحلات
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{trip.tripNumber}</h2>
            <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status as TripStatus] ?? trip.status}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {trip.vehicle && <span dir="ltr">{trip.vehicle.plateNumber} · </span>}
            {trip.driver ? `السائق: ${trip.driver.name}` : "لم يُعيّن سائق"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href={`/app/trips/${trip.id}/manifest`}><ClipboardList className="h-4 w-4" /> كشف الحمولة</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/app/trips/${trip.id}/labels`} target="_blank"><Printer className="h-4 w-4" /> طباعة كل ملصقات الرحلة</Link>
          </Button>
          {trip.status !== "COMPLETED" && <CompleteTripButton tripId={trip.id} disabled={remainingUnloads > 0} />}
        </div>
      </div>

      <div className="space-y-3">
        {await Promise.all(
          trip.stops.map(async (stop) => {
            const pendingLoad = stop.shipmentLoads.filter((l) => !l.loadedAt).length;
            const pendingUnload = stop.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length;
            const cartonsToLoad = stop.shipmentLoads.filter((l) => !l.loadedAt).reduce((s, l) => s + l.shipment.totalCartons, 0);
            const cartonsToUnload = stop.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).reduce((s, l) => s + l.shipment.totalCartons, 0);
            const eligible = stop.loadingEnabled ? await getUnassignedShipmentsForStop(user.companyId!, trip.id, stop.branchId) : [];
            const timing = stopTiming(stop.plannedArrival, stop.actualArrival);
            const isDone = stop.status === "DEPARTED" || stop.status === "DONE";
            const isCurrent = stop.id === currentStopId;

            return (
              <Card
                key={stop.id}
                data-testid={`stop-${stop.id}`}
                className={cn(isCurrent && "ring-1 ring-primary/40", isDone && !isCurrent && "bg-muted/20")}
              >
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        isDone ? "bg-success/15 text-success" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {isDone ? <Check className="h-3.5 w-3.5" /> : stop.sequence}
                    </span>
                    <CardTitle className="text-base flex items-center gap-1"><MapPin className="h-4 w-4" /> {stop.branch.name}</CardTitle>
                    <Badge variant="outline">{STOP_STATUS_LABELS[stop.status]}</Badge>
                    {timing && <StopTimingBadge timing={timing} />}
                    {stop.plannedArrival && (
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {formatBusinessDateTime(stop.plannedArrival, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {stop.loadingEnabled && !tripClosed && <AssignShipmentDialog tripId={trip.id} shipments={eligible} />}
                    {!tripClosed && <StopActions
                      tripId={trip.id}
                      stopId={stop.id}
                      loadingEnabled={stop.loadingEnabled}
                      unloadingEnabled={stop.unloadingEnabled}
                      pendingLoad={pendingLoad}
                      pendingUnload={pendingUnload}
                      unloadShipments={unloadShipmentsFor(stop)}
                      stopStatus={stop.status}
                    />}
                  </div>
                </CardHeader>
                <CardContent className="grid sm:grid-cols-2 gap-4">
                  {stop.loadingEnabled && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2"><Boxes className="h-3.5 w-3.5" /> تحميل من هذه المحطة</p>
                      <p className="text-lg font-bold">{stop.shipmentLoads.length} شحنة <span className="text-sm font-normal text-muted-foreground">/ {stop.shipmentLoads.reduce((s, l) => s + l.shipment.totalCartons, 0)} كرتون</span></p>
                      {/* On a finished trip these are not pending tasks — they are shipments that
                          stayed behind, which is a fact about the past, not a to-do. */}
                      {pendingLoad > 0 && !tripClosed && <p className="text-xs text-warning mt-1">بانتظار تحميل {pendingLoad} شحنة ({cartonsToLoad} كرتون)</p>}
                      {pendingLoad > 0 && tripClosed && <p className="text-xs text-muted-foreground mt-1">لم تُحمّل {pendingLoad} شحنة — بقيت في فرعها</p>}
                    </div>
                  )}
                  {stop.unloadingEnabled && (
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2"><Boxes className="h-3.5 w-3.5" /> تفريغ في هذه المحطة</p>
                      <p className="text-lg font-bold">{stop.shipmentUnloads.length} شحنة <span className="text-sm font-normal text-muted-foreground">/ {stop.shipmentUnloads.reduce((s, l) => s + l.shipment.totalCartons, 0)} كرتون</span></p>
                      {pendingUnload > 0 && !tripClosed && <p className="text-xs text-warning mt-1">بانتظار تفريغ {pendingUnload} شحنة ({cartonsToUnload} كرتون)</p>}
                    </div>
                  )}

                  <div className="sm:col-span-2 space-y-1 max-h-40 overflow-y-auto">
                    {[...stop.shipmentLoads, ...stop.shipmentUnloads].map((l) => (
                      <div key={l.id} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
                        <Link href={`/app/shipments/${l.shipmentId}`} className="text-primary hover:underline">{l.shipment.shipmentNumber}</Link>
                        <span className="text-muted-foreground">{l.shipment.customer.name}</span>
                        <ShipmentStatusBadge status={l.shipment.status} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
