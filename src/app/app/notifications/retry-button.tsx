"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { retryNotificationAction } from "./actions";

/**
 * Not ActionButton: a retry that reaches the provider and is rejected again is a *completed*
 * action with a failed outcome, and ActionButton's fixed success toast would report it as "done".
 * The three outcomes the service can return each need their own message, because the whole point of
 * the button is telling the employee whether the customer has now been reached.
 */
export function RetryNotificationButton({ logId }: { logId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await retryNotificationAction(logId);
          if ("error" in result) {
            toast.error(result.error);
            return;
          }
          router.refresh();
          if (result.status === "SENT") toast.success("تم إرسال الإشعار");
          else if (result.status === "SKIPPED") toast.info("لا حاجة لإعادة الإرسال — وصلت الرسالة لنفس الرقم");
          else toast.error("فشلت إعادة الإرسال — راجع السبب في السجل");
        })
      }
    >
      <RotateCw className="h-4 w-4" /> {pending ? "جارٍ الإرسال..." : "إعادة الإرسال"}
    </Button>
  );
}
