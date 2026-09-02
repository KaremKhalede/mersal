import { requireCompanyUser } from "@/lib/auth";
import { requireCan, can } from "@/lib/rbac";
import { getTripDetail, getUnassignedShipmentsForStop, activeCrewAssignments } from "@/modules/trips/service";
import { prisma } from "@/lib/db";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShipmentStatusBadge, StopTimingBadge } from "@/components/ui/status-badge";
import Link from "next/link";
import { MapPin, Boxes, Printer, Check, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AssignShipmentDialog } from "./assign-shipment-dialog";
import { StopActions } from "./stop-actions";
import type { UnloadShipment } from "@/components/shell/unload-dialog";
import { CompleteTripButton } from "./complete-trip-button";
import { AssignCrewDialog } from "./assign-crew-dialog";
import { CancelTripButton, RemoveShipmentButton } from "./trip-row-actions";
import { stopTiming } from "@/lib/stop-timing";
import { formatBusinessTime, formatDateStamp } from "@/lib/timezone";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";
import { PageHeader } from "@/components/shell/page-header";

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
  const tripCancelled = trip.status === "CANCELLED";
  const tripClosed = trip.status === "COMPLETED" || tripCancelled;

  const canAssignCrew = can(user, "trips", "assignDriver") && !tripClosed;
  const canEditTrip = can(user, "trips", "edit") && !tripClosed;

  /*
    A trip can only be called off while it is still a plan — nothing loaded, nowhere departed. Same
    two conditions cancelTrip enforces in its transaction, checked here so the button is simply not
    offered for a trip that has already happened, rather than offered and then refused.
  */
  const everLoaded = trip.stops.some((st) => st.shipmentLoads.some((l) => l.loadedAt) || st.shipmentUnloads.some((l) => l.loadedAt));
  const everMoved = trip.stops.some((st) => st.status === "DEPARTED" || st.status === "DONE");
  const canCancel = canEditTrip && !everLoaded && !everMoved;
  const linkedShipments = new Set(trip.stops.flatMap((st) => st.shipmentLoads.map((l) => l.shipmentId))).size;

  // The crew picker's options, and who is already committed elsewhere. Only fetched for a user who
  // can act on them — a viewer gets the trip, not the company's roster.
  const [drivers, vehicles, crewConflicts] = canAssignCrew
    ? await Promise.all([
        prisma.user.findMany({
          where: { companyId: user.companyId!, userType: "DRIVER", status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.vehicle.findMany({
          where: { companyId: user.companyId!, isActive: true },
          select: { id: true, plateNumber: true },
          orderBy: { plateNumber: "asc" },
        }),
        activeCrewAssignments(user.companyId!, trip.id),
      ])
    : [[], [], { drivers: {} as Record<string, string>, vehicles: {} as Record<string, string> }];
  // Same "what's next" rule the driver app uses (src/app/driver/page.tsx) — the first stop not yet
  // wrapped up, so office staff and drivers read the route the same way.
  const currentStopId = (trip.stops.find((s) => s.status !== "DEPARTED" && s.status !== "DONE") ?? trip.stops[trip.stops.length - 1])?.id;
  const currentIndex = trip.stops.findIndex((s) => s.id === currentStopId);
  const currentStop = currentIndex >= 0 ? trip.stops[currentIndex] : undefined;

  // Trip totals, keyed by shipment so one that both loads and unloads on this route is counted once.
  // Counted off shipment.totalCartons rather than a loaded-cartons column, which reads 0 until the
  // boxes are physically aboard — the same rule and the same figures the driver's own screen uses
  // (src/app/driver/trip/[id]/trip-view.tsx), so office and driver state the same load.
  const cartonsByShipment = new Map<string, number>();
  for (const stop of trip.stops) {
    for (const link of stop.shipmentLoads) cartonsByShipment.set(link.shipmentId, link.shipment.totalCartons);
  }
  const totalShipments = cartonsByShipment.size;
  const totalCartons = [...cartonsByShipment.values()].reduce((sum, n) => sum + n, 0);
  // Only the stop the trip is actually sitting at can be on time or late; a finished trip is not
  // "late" at anything any more. Same helper the stop rows use, so the two never disagree.
  const currentTiming = !tripClosed && currentStop ? stopTiming(currentStop) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={trip.tripNumber}
        // The driver moved out of this string and into the summary strip below, where they are a
        // link rather than three words of prose. The plate stays here: it identifies the trip, and
        // a vehicle has no page to open.
        description={trip.vehicle?.plateNumber}
        badge={<Badge variant="outline">{TRIP_STATUS_LABELS[trip.status as TripStatus] ?? trip.status}</Badge>}
        parent={{ label: "الرحلات", href: "/app/trips" }}
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/app/trips/${trip.id}/manifest`}><ClipboardList className="h-4 w-4" /> كشف الحمولة</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/app/trips/${trip.id}/labels`} target="_blank"><Printer className="h-4 w-4" /> طباعة كل ملصقات الرحلة</Link>
            </Button>
            {canAssignCrew && (
              <AssignCrewDialog
                tripId={trip.id}
                currentDriverId={trip.driverId}
                currentVehicleId={trip.vehicleId}
                drivers={drivers.map((d) => ({ id: d.id, label: d.name, busyOn: crewConflicts.drivers[d.id] }))}
                vehicles={vehicles.map((v) => ({ id: v.id, label: v.plateNumber, busyOn: crewConflicts.vehicles[v.id] }))}
              />
            )}
            {canCancel && <CancelTripButton tripId={trip.id} shipmentCount={linkedShipments} />}
            {!tripClosed && <CompleteTripButton tripId={trip.id} disabled={remainingUnloads > 0} />}
          </>
        }
      />

      {/*
        What a dispatcher asks about a trip before reading any single stop: how far along is it,
        how much is aboard, and is it running late. Every figure here was already on the page —
        scattered one-per-stop, with the trip's own totals stated nowhere at all.
      */}
      <Card>
        <CardContent
          className={cn(
            "grid divide-x divide-x-reverse text-center",
            // Four cells when there is no arrival to judge, five when there is.
            currentTiming ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4"
          )}
        >
          <Fact
            label={tripClosed ? "المحطات المنجزة" : "المحطة الحالية"}
            value={tripClosed ? `${trip.stops.length} / ${trip.stops.length}` : `${currentIndex + 1} / ${trip.stops.length}`}
            ltr
          />
          <Fact label="الشحنات" value={String(totalShipments)} ltr />
          <Fact label="الكراتين" value={String(totalCartons)} ltr />
          {/* The driver, as a way into their record. Trip.driverId has always existed; nothing in
              the product ever let anyone follow it, so "how many trips has this driver run" had no
              answer on any screen. */}
          <div className="flex flex-col items-center justify-center gap-0.5 px-2">
            {trip.driver ? (
              <Link href={`/app/employees/${trip.driverId}`} className="truncate font-semibold text-primary hover:underline">
                {trip.driver.name}
              </Link>
            ) : (
              <span className="font-semibold text-muted-foreground">لم يُعيّن</span>
            )}
            <p className="text-xs text-muted-foreground">السائق</p>
          </div>
          {currentTiming && (
            <div className="flex flex-col items-center justify-center gap-1 px-2">
              <StopTimingBadge timing={currentTiming} />
              <p className="text-xs text-muted-foreground">حالة الوصول</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/*
        The stops as a route, not as a pile of cards.

        The spine is one flex column per row: the node, then a connector that grows to fill whatever
        height the card next to it happens to be. No absolute positioning and no fixed heights, so a
        stop with twelve shipments and a stop with none stay joined. In RTL the spine lands on the
        reading start (right) because it is simply the first child.

        The segment below a departed stop is drawn in the success tone, so how far the trip has
        actually travelled is readable from the line alone. Nothing here is a new status: done /
        current / upcoming are the same three the cards already distinguished.
      */}
      <ol className="space-y-0">
        {await Promise.all(
          trip.stops.map(async (stop, stopIndex) => {
            const pendingLoad = stop.shipmentLoads.filter((l) => !l.loadedAt).length;
            const pendingUnload = stop.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length;
            const cartonsToLoad = stop.shipmentLoads.filter((l) => !l.loadedAt).reduce((s, l) => s + l.shipment.totalCartons, 0);
            const cartonsToUnload = stop.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).reduce((s, l) => s + l.shipment.totalCartons, 0);
            const canLoadHere = stop.loadingEnabled && !tripClosed && !stop.actualDeparture && stop.status !== "DEPARTED" && stop.status !== "DONE";
            const eligible = canLoadHere ? await getUnassignedShipmentsForStop(user.companyId!, trip.id, stop.branchId) : [];
            const timing = stopTiming(stop);
            const isDone = stop.status === "DEPARTED" || stop.status === "DONE";
            // A finished trip has no current stop. currentStopId falls back to the last stop so the
            // "what's next" rule always resolves, but painting that fallback as the live stop put a
            // blue "you are here" outline on a trip that ended days ago.
            const isCurrent = !tripClosed && stop.id === currentStopId;

            const isLast = stopIndex === trip.stops.length - 1;

            return (
              <li key={stop.id} className="flex gap-3 sm:gap-4">
                {/* the spine */}
                <div className="flex w-7 shrink-0 flex-col items-center" aria-hidden="true">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      isDone ? "bg-success/15 text-success" : isCurrent ? "bg-primary text-primary-foreground ring-4 ring-primary/20" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : stop.sequence}
                  </span>
                  {!isLast && <span className={cn("w-0.5 flex-1", isDone ? "bg-success/40" : "bg-border")} />}
                </div>

                <div className={cn("min-w-0 flex-1", !isLast && "pb-3")}>
              <Card
                data-testid={`stop-${stop.id}`}
                className={cn(isCurrent && "ring-2 ring-primary", isDone && !isCurrent && "bg-muted/20")}
              >
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-1"><MapPin className="h-4 w-4" /> {stop.branch.name}</CardTitle>
                    <Badge variant="outline">{STOP_STATUS_LABELS[stop.status]}</Badge>
                    {timing && <StopTimingBadge timing={timing} />}
                    {/* The fact the badge is derived from. Until the arrival action existed this
                        column was null on every row, so the badge beside it was measuring a plan
                        against `now` and drifting later every day — see src/lib/stop-timing.ts. */}
                    {stop.actualArrival && (
                      <span className="text-xs text-muted-foreground">
                        وصلت <span dir="ltr">{formatBusinessTime(stop.actualArrival)}</span>
                      </span>
                    )}
                    {stop.plannedArrival && (
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {formatDateStamp(stop.plannedArrival)}
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
                      arrived={stop.actualArrival !== null}
                      isCurrent={isCurrent}
                    />}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/*
                    One line instead of two bordered panels. The panels spent ~100px of card height
                    on a single figure each, and a stop with nothing to do still drew both of them
                    at full size to say "0 شحنة / 0 كرتون" twice. Same numbers, same pending
                    warnings, a third of the height.
                  */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {/* A stop with nothing on either side says so once, instead of stating zero
                        twice. Not "this stop has no shipments" — a shipment bound to unload here
                        that has not been loaded yet is real, it is simply not this stop's work.
                        Same wording the driver's screen already uses for the same situation. */}
                    {stop.shipmentLoads.length === 0 && stop.shipmentUnloads.length === 0 ? (
                      <span className="text-muted-foreground">لا تحميل ولا تفريغ هنا الآن</span>
                    ) : (
                      <>
                    {/* The count and its unit stay one text run ("3 شحنة"), separated by a real
                        space rather than by a flex gap between two sibling spans — that split the
                        figure from the noun it counts, leaving textContent reading "تحميل3شحنة".
                        Bad for a screen reader, and it silently broke three tests that look for the
                        phrase a human sees. */}
                    {stop.loadingEnabled && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Boxes className="h-3.5 w-3.5" />
                        تحميل
                        <span>
                          <span className="font-semibold text-foreground">{stop.shipmentLoads.length}</span> شحنة
                          {" · "}
                          <span className="font-semibold text-foreground">{stop.shipmentLoads.reduce((s, l) => s + l.shipment.totalCartons, 0)}</span> كرتون
                        </span>
                      </span>
                    )}
                    {stop.unloadingEnabled && (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Boxes className="h-3.5 w-3.5" />
                        تفريغ
                        <span>
                          <span className="font-semibold text-foreground">{stop.shipmentUnloads.length}</span> شحنة
                          {" · "}
                          <span className="font-semibold text-foreground">{stop.shipmentUnloads.reduce((s, l) => s + l.shipment.totalCartons, 0)}</span> كرتون
                        </span>
                      </span>
                    )}
                      </>
                    )}
                  </div>

                  {/* On a finished trip these are not pending tasks — they are shipments that
                      stayed behind, which is a fact about the past, not a to-do. */}
                  {pendingLoad > 0 && !tripClosed && <p className="text-xs text-warning">بانتظار تحميل {pendingLoad} شحنة ({cartonsToLoad} كرتون)</p>}
                  {pendingLoad > 0 && tripClosed && <p className="text-xs text-muted-foreground">لم تُحمّل {pendingLoad} شحنة — بقيت في فرعها</p>}
                  {pendingUnload > 0 && !tripClosed && <p className="text-xs text-warning">بانتظار تفريغ {pendingUnload} شحنة ({cartonsToUnload} كرتون)</p>}

                  {/* No max-h/overflow any more: an inner scrollbar inside a card inside the page
                      hid rows behind a scroll nobody looks for, and the compact rows below make a
                      long stop cost far less height than the trapped list saved. */}
                  <div className="space-y-0.5">
                    {/* Tagged by side so "إزالة" appears exactly once per link — on the stop that
                        loads it, which is where it was added — instead of twice for a shipment
                        whose unload stop is also on this page. */}
                    {[
                      ...stop.shipmentLoads.map((l) => ({ link: l, removable: canEditTrip && !l.loadedAt })),
                      ...stop.shipmentUnloads.map((l) => ({ link: l, removable: false })),
                    ].map(({ link: l, removable }) => (
                      // The row's content is capped at a readable measure while the rule under it
                      // still spans the card. justify-between — and equally an `ms-auto` on the
                      // badge — threw these three apart across ~1050px on a wide screen, which
                      // reads as three unrelated things rather than one shipment. Capped, they stay
                      // one group and the badges still line up in a column across rows.
                      <div key={l.id} className="border-b py-1.5 text-sm last:border-0">
                        <div className="flex w-full max-w-xl items-center gap-2">
                          <Link href={`/app/shipments/${l.shipmentId}`} className="shrink-0 font-medium text-primary hover:underline" dir="ltr">
                            {l.shipment.shipmentNumber}
                          </Link>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.shipment.customer.name}</span>
                          <span className="shrink-0"><ShipmentStatusBadge status={l.shipment.status} /></span>
                          {/* The undo for a wrong pick in the assign dialog. Gone the moment the
                              boxes are aboard — at that point the record is history, not a plan. */}
                          {removable && (
                            <span className="shrink-0">
                              <RemoveShipmentButton tripId={trip.id} linkId={l.id} shipmentNumber={l.shipment.shipmentNumber} />
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
                </div>
              </li>
            );
          })
        )}
      </ol>
    </div>
  );
}

/** One cell of the trip strip. Local to this page, same as the shipment page's own copy — two uses
 *  is where a shared component starts being worth extracting, and this is the second; if a third
 *  surface wants it, that is the moment to lift it out rather than now. */
function Fact({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0 px-2">
      <p className="truncate text-base font-bold" dir={ltr ? "ltr" : undefined}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
