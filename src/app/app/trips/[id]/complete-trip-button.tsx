"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { completeTripAction } from "../actions";

export function CompleteTripButton({ tripId, disabled }: { tripId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      disabled={disabled || pending}
      title={disabled ? "أكمل تفريغ جميع الشحنات أولاً" : undefined}
      onClick={() =>
        startTransition(async () => {
          try {
            await completeTripAction(tripId);
            router.refresh();
            toast.success("تم إنهاء الرحلة");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "تعذّر إنهاء الرحلة");
          }
        })
      }
    >
      <CheckCircle2 className="h-4 w-4" /> إنهاء الرحلة
    </Button>
  );
}
