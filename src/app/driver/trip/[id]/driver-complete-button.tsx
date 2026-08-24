"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { driverCompleteTripAction } from "../../actions";

/**
 * Shown only once it is actually the driver's next step — the sticky bar decides that — so there is
 * no `disabled` state left to model: a greyed-out "إنهاء الرحلة" sitting under a driver at stop 1
 * of 3 was a control that never did anything, competing with the one that did.
 *
 * Lands on the trip's own page rather than /driver: a COMPLETED trip stops matching /driver's
 * active-trip query, so pushing there showed a driver who had just finished a day's run the empty
 * state ("لا توجد رحلة نشطة") instead of a confirmation that the work is done.
 */
export function DriverCompleteButton({ tripId }: { tripId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      className="h-14 w-full text-base font-semibold"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await driverCompleteTripAction(tripId);
          if (r?.error) { toast.error(r.error); return; }
          router.refresh();
          toast.success("تم إنهاء الرحلة بنجاح");
          router.push(`/driver/trip/${tripId}`);
        })
      }
    >
      <CheckCircle2 className="h-5 w-5" /> تأكيد نهاية الرحلة
    </Button>
  );
}
