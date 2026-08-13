"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Truck, CheckCircle2 } from "lucide-react";
import { markOutForDeliveryAction, markDeliveredAction } from "./actions";

export function DeliveryQueueActions({ requestId, shipmentId, status }: { requestId: string; shipmentId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        toast.success("تم تحديث حالة التوصيل");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء");
      }
    });
  }

  if (status === "ASSIGNED") {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => markOutForDeliveryAction(requestId, shipmentId))}>
        <Truck className="h-4 w-4" /> بدء التوصيل
      </Button>
    );
  }

  if (status === "OUT_FOR_DELIVERY") {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => markDeliveredAction(requestId, shipmentId))}>
        <CheckCircle2 className="h-4 w-4" /> تأكيد التوصيل
      </Button>
    );
  }

  return <span className="text-muted-foreground text-xs">—</span>;
}
