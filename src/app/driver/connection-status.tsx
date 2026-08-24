"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The driver's connection, made visible — and the trip re-read the moment it comes back.
 *
 * This screen is used in a truck, at a branch gate, and on a road between cities. Without this, a
 * driver with no signal taps "تأكيد التفريغ", watches a spinner, and gets nothing: the server action
 * is a network request, and a failed one on a page with no connection indicator is indistinguishable
 * from an app that is broken. Every serious driver app treats the connection as first-class —
 * Onfleet blocks starting or completing a task without one by default, Bringg shows a "No Internet
 * Connection" banner and offers a manual sync — so the two things worth borrowing are the banner and
 * the refresh, and nothing else.
 *
 * Deliberately NOT a service worker or an offline write queue. The driver's taps drive a state
 * machine that also messages customers over WhatsApp; replaying a queue of them hours later, against
 * a trip the office may have changed in the meantime, produces confident wrong data — which is worse
 * than a driver who can see they have no signal and waits thirty seconds.
 *
 * The refresh is the other half. In a standalone (installed) window there is no browser reload
 * button, so a trip the office edited mid-run would sit stale on the driver's screen with no way to
 * pull the new version.
 */
export function ConnectionStatus() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Read after mount, never during render: navigator does not exist on the server, and starting
    // from `false` keeps the server and client markup identical.
    const sync = () => setOffline(!navigator.onLine);
    sync();

    const back = () => {
      sync();
      router.refresh();
    };
    window.addEventListener("online", back);
    window.addEventListener("offline", sync);

    // Coming back to the app is the other moment the screen is likely stale: the phone was in a
    // pocket for an hour of driving, and `online` never fired because the signal never technically
    // dropped. Refreshing on the way back in costs one request and is the closest thing to Bringg's
    // pull-to-refresh that does not need the driver to know it exists.
    const onVisible = () => {
      if (document.visibilityState === "visible") back();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        aria-label="تحديث"
        data-testid="driver-refresh"
        className="size-9 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
      </Button>

      {offline && (
        // Pinned over the header, not inserted into the flow: the driver may be halfway down a
        // manifest when the signal drops, and a banner they have to scroll up to find is a banner
        // that failed. It covers a static header, never the stop being worked.
        <div
          data-testid="driver-offline"
          role="status"
          className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground"
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          لا يوجد اتصال — لن تُحفظ التأكيدات حتى تعود الشبكة
        </div>
      )}
    </>
  );
}
