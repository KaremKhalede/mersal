"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCheck, PackageOpen, ArrowLeftCircle } from "lucide-react";
import { confirmLoadAction, confirmUnloadAction, departStopAction } from "../actions";

export function StopActions({
  tripId,
  stopId,
  loadingEnabled,
  unloadingEnabled,
  pendingLoad,
  pendingUnload,
  stopStatus,
}: {
  tripId: string;
  stopId: string;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  pendingLoad: number;
  pendingUnload: number;
  stopStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const departed = stopStatus === "DEPARTED";

  return (
    <div className="flex flex-wrap gap-2">
      {unloadingEnabled && pendingUnload > 0 && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await confirmUnloadAction(tripId, stopId);
              router.refresh();
              toast.success(`تم تفريغ ${r.shipmentsUnloaded} شحنة (${r.cartonsUnloaded} كرتون)`);
            })
          }
        >
          <PackageOpen className="h-4 w-4" /> تأكيد التفريغ ({pendingUnload})
        </Button>
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
