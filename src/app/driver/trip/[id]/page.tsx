import { requireDriver } from "@/lib/auth";
import { getTripDetail } from "@/modules/trips/service";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, ChevronLeft, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { DriverStopActions } from "./driver-stop-actions";
import { DriverCompleteButton } from "./driver-complete-button";
import { StopManifest, type ManifestRow } from "./stop-manifest";
import type { UnloadShipment } from "@/components/shell/unload-dialog";
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";

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

export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDriver();
  const { id } = await params;
  const trip = await getTripDetail(user.companyId!, id);
  if (!trip || trip.driverId !== user.id) notFound();

  // Same ONBOARD rule the server enforces: only what is actually on the truck blocks finishing.
  const remainingUnloads = trip.stops.reduce((sum, s) => sum + s.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length, 0);
  const tripClosed = trip.status === "COMPLETED";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center gap-2">
        <Link href="/driver" className="text-muted-foreground"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-lg font-bold">تفاصيل الرحلة</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge>{trip.tripNumber}</Badge>
            <Badge variant="outline">{TRIP_STATUS_LABELS[trip.status as TripStatus] ?? trip.status}</Badge>
          </div>
          <div className="space-y-3">
            {trip.stops.map((stop) => {
              // A shipment can only be unloaded here if it was actually loaded somewhere first —
              // links whose loading is still pending are not this stop's business yet.
              const unloadLinks = stop.shipmentUnloads.filter((l) => l.loadedAt);
              const loadRows = stop.loadingEnabled ? toRows(stop.shipmentLoads, "LOAD") : [];
              const unloadRows = stop.unloadingEnabled ? toRows(unloadLinks, "UNLOAD") : [];
              const pendingLoad = loadRows.filter((r) => !r.done).length;
              const pendingUnload = unloadRows.filter((r) => !r.done).length;
              const departed = stop.status === "DEPARTED";
              const nothingHere = loadRows.length === 0 && unloadRows.length === 0;

              return (
                <div key={stop.id} data-testid={`stop-${stop.id}`} className={`rounded-xl border p-3 space-y-3 ${!departed ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{stop.branch.name}</p>
                    <span className="ms-auto text-xs text-muted-foreground">محطة {stop.sequence}</span>
                  </div>

                  {/* Unloading first, matching the physical order at a stop and the action buttons
                      below — you take off what belongs here before loading what leaves with you. */}
                  <StopManifest kind="UNLOAD" rows={unloadRows} />
                  <StopManifest kind="LOAD" rows={loadRows} />
                  {nothingHere && (
                    // Not "this stop has no shipments": a shipment bound to unload here that has not
                    // been loaded yet is real, it is simply not this driver's task at this stop.
                    <p className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
                      لا شيء للتحميل أو التفريغ هنا الآن
                    </p>
                  )}

                  {!tripClosed && <DriverStopActions
                    tripId={trip.id}
                    stopId={stop.id}
                    loadingEnabled={stop.loadingEnabled}
                    unloadingEnabled={stop.unloadingEnabled}
                    pendingLoad={pendingLoad}
                    pendingUnload={pendingUnload}
                    unloadShipments={unloadShipmentsFor(stop)}
                    departed={departed}
                  />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="w-full h-12 text-base border-destructive/40 text-destructive">
        <Link href={`/driver/trip/${trip.id}/report-problem`}><AlertTriangle className="h-5 w-5" /> الإبلاغ عن مشكلة</Link>
      </Button>

      {trip.status !== "COMPLETED" && <DriverCompleteButton tripId={trip.id} disabled={remainingUnloads > 0} />}
    </div>
  );
}
