"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCheck, PackageOpen, ArrowLeftCircle } from "lucide-react";
import { driverConfirmLoadAction, driverConfirmUnloadAction, driverDepartStopAction } from "../../actions";

export function DriverStopActions({
  tripId,
  stopId,
  loadingEnabled,
  unloadingEnabled,
  pendingLoad,
  pendingUnload,
  departed,
}: {
  tripId: string;
  stopId: string;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  pendingLoad: number;
  pendingUnload: number;
  departed: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2">
      {unloadingEnabled && pendingUnload > 0 && (
        <Button
          size="lg"
          variant="outline"
          className="h-12 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await driverConfirmUnloadAction(tripId, stopId);
              router.refresh();
              toast.success(`تم تفريغ ${r.shipmentsUnloaded} شحنة`);
            })
          }
        >
          <PackageOpen className="h-5 w-5" /> تأكيد التفريغ ({pendingUnload})
        </Button>
      )}
      {loadingEnabled && pendingLoad > 0 && (
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await driverConfirmLoadAction(tripId, stopId);
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
              await driverDepartStopAction(tripId, stopId);
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
