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
import { TRIP_STATUS_LABELS, type TripStatus } from "@/lib/enums";

export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDriver();
  const { id } = await params;
  const trip = await getTripDetail(user.companyId!, id);
  if (!trip || trip.driverId !== user.id) notFound();

  const remainingUnloads = trip.stops.reduce((sum, s) => sum + s.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length, 0);

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
              const pendingLoad = stop.shipmentLoads.filter((l) => !l.loadedAt).length;
              const pendingUnload = stop.shipmentUnloads.filter((l) => l.loadedAt && !l.unloadedAt).length;
              const departed = stop.status === "DEPARTED";
              return (
                <div key={stop.id} data-testid={`stop-${stop.id}`} className={`rounded-xl border p-3 ${!departed ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <p className="font-semibold">{stop.branch.name}</p>
                    <span className="ms-auto text-xs text-muted-foreground">محطة {stop.sequence}</span>
                  </div>
                  <DriverStopActions
                    tripId={trip.id}
                    stopId={stop.id}
                    loadingEnabled={stop.loadingEnabled}
                    unloadingEnabled={stop.unloadingEnabled}
                    pendingLoad={pendingLoad}
                    pendingUnload={pendingUnload}
                    departed={departed}
                  />
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
