"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCheck, PackageOpen, ArrowLeftCircle } from "lucide-react";
import { UnloadDialog, type UnloadShipment } from "@/components/shell/unload-dialog";
import { driverConfirmLoadAction, driverConfirmUnloadAction, driverDepartStopAction } from "../../actions";

export function DriverStopActions({
  tripId,
  stopId,
  loadingEnabled,
  unloadingEnabled,
  pendingLoad,
  pendingUnload,
  unloadShipments,
  departed,
}: {
  tripId: string;
  stopId: string;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  pendingLoad: number;
  pendingUnload: number;
  unloadShipments: UnloadShipment[];
  departed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      {/* Same dialog the office uses — the driver at the destination is often the only person who
          sees which carton did not come off the truck. */}
      {unloadingEnabled && pendingUnload > 0 && (
        <UnloadDialog
          trigger={<Button size="lg" variant="outline" className="h-12 w-full text-base"><PackageOpen className="h-5 w-5" /> تأكيد التفريغ ({pendingUnload})</Button>}
          shipments={unloadShipments}
          action={(formData) => driverConfirmUnloadAction(tripId, stopId, formData)}
        />
      )}
      {loadingEnabled && pendingLoad > 0 && (
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await driverConfirmLoadAction(tripId, stopId);
              if ("error" in r) { toast.error(r.error); return; }
              router.refresh();
              toast.success(`تم تحميل ${r.shipmentsLoaded} شحنة`);
            })
          }
        >
          <PackageCheck className="h-5 w-5" /> تأكيد التحميل ({pendingLoad})
        </Button>
      )}
      {!departed && (
        <Button
          size="lg"
          variant="secondary"
          className="h-12 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await driverDepartStopAction(tripId, stopId);
              if (r?.error) { toast.error(r.error); return; }
              router.refresh();
              toast.success("تمت مغادرة المحطة");
            })
          }
        >
          <ArrowLeftCircle className="h-5 w-5" /> مغادرة المحطة
        </Button>
      )}
    </div>
  );
}
