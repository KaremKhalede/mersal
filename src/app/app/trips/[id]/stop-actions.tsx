"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCheck, PackageOpen, ArrowLeftCircle, MapPinCheck } from "lucide-react";
import { UnloadDialog, type UnloadShipment } from "@/components/shell/unload-dialog";
import { arriveStopAction, confirmLoadAction, confirmUnloadAction, departStopAction } from "../actions";

export function StopActions({
  tripId,
  stopId,
  loadingEnabled,
  unloadingEnabled,
  pendingLoad,
  pendingUnload,
  unloadShipments,
  stopStatus,
  arrived,
  isCurrent,
}: {
  tripId: string;
  stopId: string;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  pendingLoad: number;
  pendingUnload: number;
  unloadShipments: UnloadShipment[];
  stopStatus: string;
  /** TripStop.actualArrival — set means the arrival is already a recorded fact. */
  arrived: boolean;
  /** The stop the trip has actually reached. `arriveAtStop` enforces the same rule server-side. */
  isCurrent: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const departed = stopStatus === "DEPARTED";

  return (
    <div className="flex flex-wrap gap-2">
      {/*
        The office's half of the same event. A branch employee is often the one who sees the truck
        pull in — and on a trip with no assigned driver, they are the only one who can record it.

        Both routes call `arriveAtStop`, so a driver-recorded arrival and an office-recorded arrival
        are the same fact written the same way; the service claim is idempotent, so whoever taps
        second changes nothing.
      */}
      {isCurrent && !arrived && !departed && (
        <Button
          size="sm"
          variant={unloadingEnabled && pendingUnload > 0 ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await arriveStopAction(tripId, stopId);
              router.refresh();
              toast.success("تم تسجيل وصول الرحلة");
            })
          }
        >
          <MapPinCheck className="h-4 w-4" /> تسجيل الوصول
        </Button>
      )}
      {/* A dialog now, not a one-click confirm: "all of it arrived" is a claim, and the only place
          the employee can say otherwise is the moment they are looking at the pile. */}
      {unloadingEnabled && pendingUnload > 0 && (
        <UnloadDialog
          trigger={<Button size="sm"><PackageOpen className="h-4 w-4" /> تأكيد التفريغ ({pendingUnload})</Button>}
          shipments={unloadShipments}
          action={(formData) => confirmUnloadAction(tripId, stopId, formData)}
        />
      )}
      {loadingEnabled && pendingLoad > 0 && (
        <Button
          size="sm"
          // Unload first, load second: whichever is still pending earliest in that order is this
          // stop's next step and carries the filled style; the other waits its turn as outline.
          variant={unloadingEnabled && pendingUnload > 0 ? "outline" : "default"}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await confirmLoadAction(tripId, stopId);
              router.refresh();
              toast.success(`تم تحميل ${r.shipmentsLoaded} شحنة (${r.cartonsLoaded} كرتون)`);
            })
          }
        >
          <PackageCheck className="h-4 w-4" /> تأكيد التحميل ({pendingLoad})
        </Button>
      )}
      {!departed && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await departStopAction(tripId, stopId);
              router.refresh();
              toast.success("تمت مغادرة المحطة");
            })
          }
        >
          <ArrowLeftCircle className="h-4 w-4" /> مغادرة المحطة
        </Button>
      )}
    </div>
  );
}
