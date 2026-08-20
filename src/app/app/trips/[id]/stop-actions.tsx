"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCheck, PackageOpen, ArrowLeftCircle } from "lucide-react";
import { UnloadDialog, type UnloadShipment } from "@/components/shell/unload-dialog";
import { confirmLoadAction, confirmUnloadAction, departStopAction } from "../actions";

export function StopActions({
  tripId,
  stopId,
  loadingEnabled,
  unloadingEnabled,
  pendingLoad,
  pendingUnload,
  unloadShipments,
  stopStatus,
}: {
  tripId: string;
  stopId: string;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  pendingLoad: number;
  pendingUnload: number;
  unloadShipments: UnloadShipment[];
  stopStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const departed = stopStatus === "DEPARTED";

  return (
    <div className="flex flex-wrap gap-2">
      {/* A dialog now, not a one-click confirm: "all of it arrived" is a claim, and the only place
          the employee can say otherwise is the moment they are looking at the pile. */}
      {unloadingEnabled && pendingUnload > 0 && (
        <UnloadDialog
          trigger={<Button size="sm" variant="outline"><PackageOpen className="h-4 w-4" /> تأكيد التفريغ ({pendingUnload})</Button>}
          shipments={unloadShipments}
          action={(formData) => confirmUnloadAction(tripId, stopId, formData)}
        />
      )}
      {loadingEnabled && pendingLoad > 0 && (
        <Button
          size="sm"
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
