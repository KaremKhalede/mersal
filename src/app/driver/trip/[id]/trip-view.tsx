import { requireDriver } from "@/lib/auth";
import { getTripDetail, getDriverTrips } from "@/modules/trips/service";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, AlertTriangle, PhoneCall, Check, ChevronDown, CheckCircle2, CalendarClock } from "lucide-react";
import Link from "next/link";
import { DriverStopActions } from "./driver-stop-actions";
import { DriverCompleteButton } from "./driver-complete-button";
import { StopManifest, type ManifestRow } from "./stop-manifest";
import type { UnloadShipment } from "@/components/shell/unload-dialog";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";
import { formatBusinessTime } from "@/lib/timezone";
import { normalizePhone } from "@/lib/phone";
import { cn } from "@/lib/utils";

type StopLink = {
  id: string;
  loadedAt: Date | null;
  unloadedAt: Date | null;
  shipment: {
    shipmentNumber: string;
    totalCartons: number;
    arrivedCartons: number;
    status: string;
    unloadBranch: { name: string; city: string };
  };
};

/** `done` is what the driver has already confirmed at this stop — loaded for a loading list,
 *  unloaded for an unloading one. Same row shape either way so one component renders both. */
function toRows(links: StopLink[], kind: "LOAD" | "UNLOAD"): ManifestRow[] {
  return links.map((link) => ({
    id: link.id,
    shipmentNumber: link.shipment.shipmentNumber,
    totalCartons: link.shipment.totalCartons,
    arrivedCartons: link.shipment.arrivedCartons,
    destination: link.shipment.unloadBranch.city,
    status: link.shipment.status,
    done: kind === "LOAD" ? link.loadedAt !== null : link.unloadedAt !== null,
  }));
}

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

/**
 * Where the driver is INSIDE the stop they are standing at: الوصول ← التفريغ ← التحميل ← المغادرة.
 *
 * The trip-level dots answer "which stop"; nothing answered "how far through this one". A driver at
 * a branch with cargo going both ways had to infer that from two manifests and a button, which is
 * reading, not seeing — and the answer to "هل ضغطت الزر؟" was scattered across three places (a
 * separate arrival line, a ✓ on each manifest row, a button that quietly disappeared).
 *
 * So the strip carries the timestamps too, and the standalone "وصلت الساعة" line is gone: one row
 * that states the stage AND when each finished step happened, instead of a fourth line repeating it.
 *
 * Only the stages this stop actually has: a pure drop-off shows الوصول ← التفريغ ← المغادرة, and a
 * stop with nothing to handle shows just the two ends. No empty step to read past.
 */
function stagesOf(v: {
  stop: {
    actualArrival: Date | null;
    actualDeparture: Date | null;
    shipmentLoads: { loadedAt: Date | null }[];
    shipmentUnloads: { unloadedAt: Date | null }[];
  };
  arrived: boolean;
  departed: boolean;
  loadRows: unknown[];
  unloadRows: unknown[];
  pendingLoad: number;
  pendingUnload: number;
}) {
  /** The moment the step finished = the last confirmation inside it, since one step can cover
   *  several shipments confirmed minutes apart. */
  const lastOf = (dates: (Date | null)[]) => {
    const times = dates.filter((d): d is Date => d !== null).map((d) => d.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  };

  const stages: { key: string; label: string; done: boolean; at: Date | null }[] = [
    { key: "arrive", label: "الوصول", done: v.arrived, at: v.stop.actualArrival },
  ];
  if (v.unloadRows.length > 0) {
    stages.push({
      key: "unload",
      label: "التفريغ",
      done: v.pendingUnload === 0,
      at: lastOf(v.stop.shipmentUnloads.map((l) => l.unloadedAt)),
    });
  }
  if (v.loadRows.length > 0) {
    stages.push({
      key: "load",
      label: "التحميل",
      done: v.pendingLoad === 0,
      at: lastOf(v.stop.shipmentLoads.map((l) => l.loadedAt)),
    });
  }
  stages.push({ key: "depart", label: "المغادرة", done: v.departed, at: v.stop.actualDeparture });
  return stages;
}

/** "الرياض ← المكلا" — first and last branch, which is how a driver names a trip out loud. The
 *  stops in between are on the screen already for the trip being driven, and are noise for one that
 *  has not started. */
function routeOf(trip: { stops: { branch: { name: string } }[] }) {
  const names = trip.stops.map((s) => s.branch.name);
  return names.length > 1 ? `${names[0]} ← ${names[names.length - 1]}` : names[0] ?? "";
}

/**
 * The driver's one screen, rendered by two routes: /driver (their active trip) and
 * /driver/trip/[id] (a direct link, and the parent of report-problem).
 *
 * Shared as a component rather than having /driver issue a redirect: a redirect costs an extra
 * server round trip on every app open, which is exactly the hop this change set out to remove — on
 * a phone, on a truck, on a weak connection. It also kept the login flow in a two-step redirect
 * chain that races anything navigating straight afterwards.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS STILL ONE SCREEN, AND WHY IT NOW SHOWS ONE ACTION
 * ---------------------------------------------------------------------------------------------
 * A driver has exactly one active trip by construction — /driver resolves it with a `findFirst` on
 * PLANNED|IN_PROGRESS — so a "today's trips" level would be a list of one, a bottom navigation bar
 * would have one real destination (Material's own guidance puts the floor at three of equal
 * importance), and a per-stop level would be a tap to reach content that already fits here.
 *
 * What this screen got wrong was never navigation. It was weight: every stop rendered its full
 * manifest and its full set of buttons at once, so a three-branch run put up to eight equally sized
 * primary buttons in front of a driver holding a phone in one hand at a loading dock. The screen
 * answered "ما رحلتي؟" and "أين أنا؟" but asked "ماذا أفعل الآن؟" instead of answering it.
 *
 * So the layout is now three fixed layers — the trip, the current stop, everything else folded —
 * and exactly one big button, pinned to the bottom of the viewport where a thumb actually reaches.
 * Its label is derived from the stop's state (arrive -> unload -> load -> depart -> finish), so
 * completing a step re-renders the page and the next step lands under the same thumb. The stops the
 * driver is not standing at collapse into one tappable row each, which is also where their own
 * buttons still live: acting out of order stays possible (a driver who forgot to press "مغادرة
 * المحطة" at stop 1 must be able to fix it from stop 2), it is just no longer the default.
 */
export async function DriverTripView({ tripId }: { tripId: string }) {
  const user = await requireDriver();
  const trip = await getTripDetail(user.companyId!, tripId);
  if (!trip || trip.driverId !== user.id) notFound();

  /*
    The driver's OTHER assignments — the answer to "وماذا بعد هذه الرحلة؟", which until now the app
    had no way to give.

    A driver can legitimately hold more than one trip: the office plans tomorrow while today is
    still on the road. That was previously invisible on this screen and actively harmful on the home
    route (see getDriverTrips). Listed here, quietly, at the bottom — never as a second workflow. No
    link on the rows on purpose: opening a trip that has not started is not a thing a driver needs
    to do, and finishing this one promotes the next automatically.

    On a finished trip the list starts with the active one, because that IS the next trip to drive.
  */
  const { active: activeTrip, upcoming } = await getDriverTrips(user.id);
  const otherTrips = [activeTrip, ...upcoming].filter(
    (t): t is NonNullable<typeof activeTrip> => Boolean(t) && t!.id !== trip.id
  );

  // Same ONBOARD rule the server enforces: only what is actually on the truck blocks finishing.
  const remainingUnloads = trip.stops.reduce((sum, s) => sum + s.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length, 0);
  const tripClosed = trip.status === "COMPLETED";

  // The same "what's next" rule the office trip page uses, so both read the route identically.
  const currentIndex = tripClosed ? -1 : trip.stops.findIndex((s) => s.status !== "DEPARTED" && s.status !== "DONE");
  const departedCount = trip.stops.filter((s) => s.status === "DEPARTED" || s.status === "DONE").length;
  // 1-based position of the stop being worked. A finished trip reads as "3 من 3" rather than
  // falling back to the last stop's index and claiming there is still one to do.
  const currentPosition = currentIndex >= 0 ? currentIndex + 1 : trip.stops.length;

  // What is left across the WHOLE trip, not just this stop — the answer to "how much more today".
  const pendingUnloadAll = trip.stops.reduce(
    (sum, s) => sum + (s.unloadingEnabled ? s.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length : 0),
    0
  );
  const pendingLoadAll = trip.stops.reduce(
    (sum, s) => sum + (s.loadingEnabled ? s.shipmentLoads.filter((l) => !l.loadedAt).length : 0),
    0
  );

  // Everything each stop needs, derived once: the current-stop card and that stop's collapsed row
  // are the same facts rendered at two sizes, not two passes over the data.
  const views = trip.stops.map((stop, index) => {
    // A shipment can only be unloaded here if it was actually loaded somewhere first — links whose
    // loading is still pending are not this stop's business yet.
    const unloadLinks = stop.shipmentUnloads.filter((l) => l.loadedAt);
    const loadRows = stop.loadingEnabled ? toRows(stop.shipmentLoads, "LOAD") : [];
    const unloadRows = stop.unloadingEnabled ? toRows(unloadLinks, "UNLOAD") : [];
    return {
      stop,
      index,
      loadRows,
      unloadRows,
      pendingLoad: loadRows.filter((r) => !r.done).length,
      pendingUnload: unloadRows.filter((r) => !r.done).length,
      departed: stop.status === "DEPARTED",
      arrived: stop.actualArrival !== null,
      isCurrent: index === currentIndex,
      nothingHere: loadRows.length === 0 && unloadRows.length === 0,
    };
  });
  const current = currentIndex >= 0 ? views[currentIndex] : null;

  /**
   * Whether the trip itself is the next thing to act on, rather than the stop.
   *
   * Nothing left to unload anywhere and nothing left to load: the cargo work of the day is over,
   * so the big button becomes "تأكيد نهاية الرحلة" wherever the truck happens to be standing. The
   * stop's own remaining steps (stamping an arrival, marking a departure) stay in its card as quiet
   * outline buttons — they are bookkeeping at this point, and `completeTrip` has never required
   * them. `remainingUnloads` is the server's own rule (ONBOARD), so the button is only offered when
   * the action behind it would actually succeed.
   */
  const finishNow = !tripClosed && remainingUnloads === 0 && pendingUnloadAll === 0 && pendingLoadAll === 0;

  /*
    What is physically on the truck right now — the one cargo figure that belongs to the driver.

    An earlier pass put the trip's PLANNED totals here as two big tiles and they were rightly cut:
    "4 شحنات · 28 كرتون" for a route is a number the office needs, and it does not change no matter
    what the driver does. This is the opposite: it counts only links that were loaded and not yet
    unloaded (the server's own ONBOARD rule), so it drops as the truck empties and is exactly what
    the driver is answerable for at a checkpoint or a gate. One line, and no line at all when the
    truck is empty.
  */
  const onboardLinks = trip.stops.flatMap((s) => s.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt));
  const onboardShipments = new Set(onboardLinks.map((l) => l.shipmentId)).size;
  // cartonsLoaded is what was actually put aboard; totalCartons covers a link loaded before that
  // column was written.
  const onboardCartons = onboardLinks.reduce((sum, l) => sum + (l.cartonsLoaded || l.shipment.totalCartons), 0);

  // The number for the gate that will not open and the paperwork nobody can find.
  //
  // The branch the driver is actually standing at comes first — that is who can answer "the gate is
  // locked" or "nobody here is expecting me". Head office is the fallback, for a branch created
  // before Branch.phone existed or simply left blank.
  //
  // Already E.164 in the database (branch numbers are normalised on save, see the branches action),
  // but normalizePhone runs on both anyway: it is also what rejects an unusable value, and a `tel:`
  // link built from junk is a button that silently does nothing in a truck.
  const branchPhone = current ? normalizePhone(current.stop.branch.phone ?? "") : null;
  const officePhone = branchPhone ?? normalizePhone(user.company?.phone ?? "");
  const callingBranch = Boolean(branchPhone);

  /** A stop's manifests — the only content that differs between the expanded current stop and an
   *  opened collapsed row, so both call this. */
  const work = (v: (typeof views)[number]) => (
    <>
      {/* Unloading first, matching the physical order at a stop and the action chain in the sticky
          bar — you take off what belongs here before loading what leaves with you. */}
      <StopManifest kind="UNLOAD" rows={v.unloadRows} />
      <StopManifest kind="LOAD" rows={v.loadRows} />
      {v.nothingHere && (
        // Not "this stop has no shipments": a shipment bound to unload here that has not been
        // loaded yet is real, it is simply not this driver's task at this stop.
        <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          لا شيء للتحميل أو التفريغ هنا الآن
        </p>
      )}
    </>
  );

  return (
    // pb leaves room for the fixed action bar: without it the last stop's row sits under the button
    // and cannot be opened, which on a phone reads as a broken screen rather than a layout bug.
    <div className={cn("space-y-3", tripClosed ? "pb-6" : "pb-40")}>
      {/* ── 1. THE TRIP ─────────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold" dir="ltr">{trip.tripNumber}</h1>
            <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status as TripStatus] ?? trip.status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{trip.stops.map((s) => s.branch.name).join(" ← ")}</p>

          {/*
            Where the driver is in the trip, in one glance. The dots are aria-hidden decoration; the
            sentence under them is the actual statement, so nothing here depends on colour or on
            shape alone.
          */}
          <ol className="flex items-center gap-1" aria-hidden="true">
            {views.map((v) => {
              // `|| tripClosed`: completing a trip does not require departing its last stop (see
              // `finishNow`), so without this a finished run drew grey "still to do" dots under a
              // card that says the trip is over.
              const isDone = tripClosed || v.stop.status === "DEPARTED" || v.stop.status === "DONE";
              return (
                <li key={v.stop.id} className="flex flex-1 items-center gap-1">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-bold",
                      isDone ? "bg-success/20 text-success" : v.isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isDone ? <Check className="h-3.5 w-3.5" /> : v.stop.sequence}
                  </span>
                  {v.index < views.length - 1 && (
                    <span className={cn("h-0.5 flex-1 rounded-full", isDone ? "bg-success/40" : "bg-border")} />
                  )}
                </li>
              );
            })}
          </ol>

          {/* One progress statement instead of three. The trip totals that used to sit here as two
              big tiles (شحنة / كرتون) are gone: they are a figure for the office, not an input to
              anything the driver decides while standing at a branch — the per-stop manifests below
              carry the counts that are actually his. */}
          {/* Nothing here on a finished trip: the completion card below is the statement, and
              saying it twice on one screen is reading the driver does not need to do. */}
          {!tripClosed && (
            <div className="text-sm">
              <p>
                <span className="font-semibold">المحطة {currentPosition} من {trip.stops.length}</span>
                {departedCount > 0 && <span className="text-muted-foreground"> · {departedCount} مكتملة</span>}
              </p>
              {onboardShipments > 0 && (
                <p data-testid="driver-onboard" className="text-muted-foreground">
                  على الشاحنة:{" "}
                  <span className="font-medium text-foreground">{onboardShipments} شحنة · {onboardCartons} كرتون</span>
                </p>
              )}
              {(pendingUnloadAll > 0 || pendingLoadAll > 0) && (
                <p className="text-muted-foreground">
                  المتبقي:{" "}
                  {pendingUnloadAll > 0 && <span className="font-medium text-foreground">{pendingUnloadAll} للتفريغ</span>}
                  {pendingUnloadAll > 0 && pendingLoadAll > 0 && " · "}
                  {pendingLoadAll > 0 && <span className="font-medium text-foreground">{pendingLoadAll} للتحميل</span>}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. THE CURRENT STOP (or the finish line) ────────────────────────────────────────── */}
      {tripClosed && (
        // What the driver sees the moment the work is over. Landing on "لا توجد رحلة نشطة" — which
        // is what /driver renders once the trip stops matching its query — told a driver who had
        // just finished a day's run that they had nothing, instead of that they were done.
        <Card className="border-success">
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <p className="text-lg font-bold">اكتملت الرحلة</p>
            <p className="text-sm text-muted-foreground">
              تم تفريغ جميع الشحنات وإنهاء <span dir="ltr">{trip.tripNumber}</span>.
            </p>

            {/* DONE -> NEXT, in one tap. Without this the driver's reward for finishing is a screen
                that is over, and the next assignment they already have is one they have to guess is
                there. /driver resolves to it, so the button needs no id of its own. */}
            {otherTrips.length > 0 ? (
              <div className="w-full space-y-2 rounded-lg bg-muted/60 p-3 text-start">
                <p className="text-xs text-muted-foreground">الرحلة التالية</p>
                <p className="font-semibold" dir="ltr">{otherTrips[0].tripNumber}</p>
                <p className="text-sm text-muted-foreground">{routeOf(otherTrips[0])}</p>
                <Button asChild className="h-12 w-full text-base">
                  <Link href="/driver">الذهاب إلى الرحلة التالية</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">لا يلزمك أي إجراء آخر.</p>
            )}
          </CardContent>
        </Card>
      )}

      {current && (
        <Card data-testid={`stop-${current.stop.id}`} className="border-primary bg-primary/5">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">المحطة الحالية · محطة {current.stop.sequence}</p>
                <p className="truncate text-lg font-bold">{current.stop.branch.name}</p>
                <p className="truncate text-sm text-muted-foreground">{current.stop.branch.city}</p>
              </div>
            </div>

            {/* The stop's own progress, with the times of what is already done — see stagesOf. This
                is also the driver's answer to "did my tap register?", on a connection that drops. */}
            <ol data-testid="stop-stages" className="flex items-stretch gap-1">
              {stagesOf(current).map((stage, i, all) => {
                const isCurrent = !stage.done && all.findIndex((x) => !x.done) === i;
                return (
                  <li key={stage.key} className="flex flex-1 flex-col items-center gap-1 text-center">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full",
                        stage.done
                          ? "bg-success/20 text-success"
                          : isCurrent
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {stage.done ? <Check className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
                    </span>
                    <span className={cn("text-2xs leading-tight", stage.done ? "text-success" : isCurrent ? "font-semibold" : "text-muted-foreground")}>
                      {stage.label}
                    </span>
                    {/* The time only where there is one: an unfinished step showing an empty slot
                        would be a column of dashes on a phone. */}
                    {stage.at && (
                      <span className="text-2xs text-muted-foreground" dir="ltr">{formatBusinessTime(stage.at)}</span>
                    )}
                  </li>
                );
              })}
            </ol>

            {work(current)}

            {/* The rest of this stop's chain, quiet: the loud one is in the bar below — unless the
                bar has moved on to finishing the trip, in which case the whole chain lives here. */}
            <DriverStopActions
              variant="secondary"
              skipFirst={!finishNow}
              tripId={trip.id}
              stopId={current.stop.id}
              loadingEnabled={current.stop.loadingEnabled}
              unloadingEnabled={current.stop.unloadingEnabled}
              pendingLoad={current.pendingLoad}
              pendingUnload={current.pendingUnload}
              unloadShipments={unloadShipmentsFor(current.stop)}
              departed={current.departed}
              arrived={current.arrived}
              isCurrent
            />
          </CardContent>
        </Card>
      )}

      {/* ── 3. EVERY OTHER STOP, FOLDED ─────────────────────────────────────────────────────── */}
      {views
        .filter((v) => !v.isCurrent)
        .map((v) => {
          const isDone = tripClosed || v.stop.status === "DEPARTED" || v.stop.status === "DONE";
          return (
            // <details>, not a state hook: this is a server component, the open/closed state has no
            // business surviving a refresh, and the browser's own disclosure works with no JS at all
            // — which matters on the connection this screen is used on.
            <details key={v.stop.id} data-testid={`stop-${v.stop.id}`} className="group rounded-xl border bg-card">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    isDone ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
                  )}
                >
                  {isDone ? <Check className="h-4 w-4" /> : v.stop.sequence}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{v.stop.branch.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{v.stop.branch.city}</span>
                </span>
                {isDone ? (
                  <span className="shrink-0 text-xs font-medium text-success">مكتملة</span>
                ) : v.stop.plannedArrival ? (
                  // The planned time is already on TripStop and was never shown to the driver. It is
                  // the one thing a folded upcoming stop can usefully say, and it costs no query.
                  <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">{formatBusinessTime(v.stop.plannedArrival)}</span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">قادمة</span>
                )}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="space-y-3 border-t p-3">
                {work(v)}
                {/*
                  Every stop keeps its own load/unload/depart buttons, deliberately — just quietly,
                  one fold away instead of competing with the action the driver is actually on.

                  An earlier pass restricted them to the stop the trip had "reached". It was wrong,
                  and the driver-manifest tests caught it: a driver who loads at stop 1, drives to
                  stop 2 and forgets to press "مغادرة المحطة" would arrive to a screen offering them
                  nothing at all, blocked from unloading with no explanation, in a truck. Acting out
                  of order is a recovery path, and the taps are self-correcting anyway, since
                  confirmBulkUnload only ever touches links that are actually aboard.

                  Recording an ARRIVAL is the one exception, gated inside the component below and
                  again in `arriveAtStop`: that one writes the timestamp the office's lateness signal
                  is computed from, so a stamp for a stop the truck has not reached is not a
                  recoverable mistake — it is a wrong number on someone else's screen.
                */}
                {!tripClosed && (
                  <DriverStopActions
                    variant="secondary"
                    tripId={trip.id}
                    stopId={v.stop.id}
                    loadingEnabled={v.stop.loadingEnabled}
                    unloadingEnabled={v.stop.unloadingEnabled}
                    pendingLoad={v.pendingLoad}
                    pendingUnload={v.pendingUnload}
                    unloadShipments={unloadShipmentsFor(v.stop)}
                    departed={v.departed}
                    arrived={v.arrived}
                    isCurrent={false}
                  />
                )}
              </div>
            </details>
          );
        })}

      {/* ── 4. THE TWO WAYS OUT, AT SECONDARY WEIGHT ────────────────────────────────────────── */}
      {!tripClosed && (
        <>
          <div className={cn("grid gap-2", officePhone && "grid-cols-2")}>
            <Button asChild variant="ghost" className="h-11 text-destructive hover:text-destructive">
              <Link href={`/driver/trip/${trip.id}/report-problem`}><AlertTriangle className="h-4 w-4" /> الإبلاغ عن مشكلة</Link>
            </Button>
            {/* Plain `tel:` — the driver may have no data left and every phone can place a call. */}
            {officePhone && (
              <Button asChild variant="ghost" className="h-11">
                <a href={`tel:${officePhone}`}>
                  <PhoneCall className="h-4 w-4" /> {callingBranch ? `اتصال بـ${current!.stop.branch.name}` : "اتصال بالمكتب"}
                </a>
              </Button>
            )}
          </div>

          {/* What comes after today, stated once and quietly. Rendered only when it exists — an
              empty "الرحلات القادمة" card is a line to read with nothing in it. */}
          {otherTrips.length > 0 && (
            <div data-testid="driver-upcoming" className="space-y-2 rounded-xl border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" /> بعد هذه الرحلة
              </p>
              {otherTrips.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="font-semibold" dir="ltr">{t.tripNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{routeOf(t)}</span>
                  {t.stops[0]?.plannedArrival && (
                    <span className="shrink-0 text-xs text-muted-foreground" dir="ltr">
                      {formatBusinessTime(t.stops[0].plannedArrival)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── THE ONE ACTION ───────────────────────────────────────────────────────────────
              Fixed to the bottom of the viewport, not to the end of the document: roughly half of
              people hold a phone one-handed and the reachable third of the screen is the bottom, so
              the step the driver is on should never be something they have to scroll to find. */}
          <div data-testid="driver-primary-action" className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur">
            <div className="mx-auto w-full max-w-md space-y-1.5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {current && !finishNow ? (
                <>
                  <p className="text-center text-xs text-muted-foreground">
                    الخطوة التالية في <span className="font-medium text-foreground">{current.stop.branch.name}</span>
                  </p>
                  <DriverStopActions
                    variant="primary"
                    tripId={trip.id}
                    stopId={current.stop.id}
                    loadingEnabled={current.stop.loadingEnabled}
                    unloadingEnabled={current.stop.unloadingEnabled}
                    pendingLoad={current.pendingLoad}
                    pendingUnload={current.pendingUnload}
                    unloadShipments={unloadShipmentsFor(current.stop)}
                    departed={current.departed}
                    arrived={current.arrived}
                    isCurrent
                  />
                </>
              ) : remainingUnloads === 0 ? (
                <DriverCompleteButton tripId={trip.id} />
              ) : (
                // Every stop is behind the driver and cargo is still aboard — the one state with no
                // action to offer. A dead disabled button explains nothing, so this says the same
                // thing completeTrip would have thrown ("لا يمكن إنهاء الرحلة قبل تفريغ جميع
                // الشحنات"), before the tap instead of after it.
                <p className="rounded-lg bg-warning/15 p-3 text-center text-sm font-medium text-warning">
                  بقي {remainingUnloads} شحنة على الشاحنة — فرّغها قبل إنهاء الرحلة
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
