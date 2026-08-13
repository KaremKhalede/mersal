"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { driverCompleteTripAction } from "../../actions";

export function DriverCompleteButton({ tripId, disabled }: { tripId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      className="w-full h-12 text-base"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await driverCompleteTripAction(tripId);
            router.refresh();
            toast.success("تم إنهاء الرحلة بنجاح");
            router.push("/driver");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "تعذّر إنهاء الرحلة");
          }
        })
      }
    >
      <CheckCircle2 className="h-5 w-5" /> تأكيد نهاية الرحلة
    </Button>
  );
}
