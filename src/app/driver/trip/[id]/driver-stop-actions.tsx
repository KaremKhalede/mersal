"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PackageCheck, PackageOpen, ArrowLeftCircle, MapPinCheck } from "lucide-react";
import { UnloadDialog, type UnloadShipment } from "@/components/shell/unload-dialog";
import { FormDialog } from "@/components/shell/form-dialog";
import { driverArriveStopAction, driverConfirmLoadAction, driverConfirmUnloadAction, driverDepartStopAction } from "../../actions";

export function DriverStopActions({
  tripId,
  stopId,
  loadingEnabled,
  unloadingEnabled,
  pendingLoad,
  pendingUnload,
  unloadShipments,
  departed,
  arrived,
  isCurrent,
  variant,
  skipFirst = false,
}: {
  tripId: string;
  stopId: string;
  loadingEnabled: boolean;
  unloadingEnabled: boolean;
  pendingLoad: number;
  pendingUnload: number;
  unloadShipments: UnloadShipment[];
  departed: boolean;
  /** Whether this stop's arrival has already been recorded (TripStop.actualArrival). */
  arrived: boolean;
  /** The stop the trip has actually reached — the first one not yet departed. Only that stop may
   *  record an arrival, and `arriveAtStop` enforces the same rule server-side. */
  isCurrent: boolean;
  /**
   * "primary" renders ONLY the next step in the chain, as the one big button in the sticky bar.
   * "secondary" renders every step this stop still has, as quiet outline buttons inside its
   * collapsed row — the recovery path for a stop the driver worked out of order.
   */
  variant: "primary" | "secondary";
  /**
   * Drops the head of the chain from a "secondary" list — used by the current stop, whose head is
   * already the big button in the action bar.
   *
   * This is what keeps the one-action rule from becoming a gate. The chain starts with "تأكيد
   * الوصول", and a driver who has not pressed it is still standing in front of cargo that has to
   * move: without the rest of the chain rendered somewhere, arriving would be a hard prerequisite
   * for loading, which is a workflow the service never enforced and this screen has no business
   * inventing. So the next step is loud, and the ones after it stay quietly reachable.
   */
  skipFirst?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * Runs one driver action and reports what happened, including the failure the driver actually
   * hits: no signal.
   *
   * The actions themselves already return their refusals as data (see driver/actions.ts), but a
   * request that never reaches the server rejects instead — and an unhandled rejection inside a
   * transition surfaces as nothing at all. That is a driver tapping "تأكيد التفريغ" at a branch with
   * one bar, watching the button settle, and having no idea whether the boxes were recorded.
   */
  function run(body: () => Promise<void>) {
    startTransition(async () => {
      try {
        await body();
      } catch {
        toast.error("تعذّر الاتصال بالخادم — تحقق من الشبكة وحاول مرة أخرى");
      }
    });
  }

  const primary = variant === "primary";
  const cls = primary ? "h-14 w-full text-base font-semibold" : "h-12 w-full text-base";
  const look = primary ? undefined : ("outline" as const);

  /*
    The chain, in the order the work physically happens at a branch: the truck pulls in, what
    belongs here comes off, what leaves with you goes on, then you drive away.

    This ordering is the whole point of the screen. Rendering all four at once — which is what this
    component used to do, for every stop on the trip at the same time — put up to eight equally
    sized buttons in front of a driver holding a phone in one hand at a loading dock, and made
    "ماذا أفعل الآن؟" a question the app asked instead of answered.
  */
  const steps: React.ReactNode[] = [];

  // Arrival first, and gated: it fills TripStop.actualArrival, which the office's lateness signal
  // is computed from (src/lib/stop-timing.ts). `arriveAtStop` enforces the same rule server-side,
  // so a stale page cannot post its way past it.
  if (isCurrent && !arrived && !departed) {
    steps.push(
      <Button
        key="arrive"
        className={cls}
        variant={look}
        disabled={pending}
        onClick={() =>
          run(async () => {
            const r = await driverArriveStopAction(tripId, stopId);
            if (r?.error) { toast.error(r.error); return; }
            router.refresh();
            toast.success("تم تسجيل الوصول");
          })
        }
      >
        <MapPinCheck className="h-5 w-5" /> تأكيد الوصول
      </Button>
    );
  }

  // Same dialog the office uses — the driver at the destination is often the only person who sees
  // which carton did not come off the truck.
  if (unloadingEnabled && pendingUnload > 0) {
    steps.push(
      <UnloadDialog
        key="unload"
        trigger={<Button className={cls} variant={look}><PackageOpen className="h-5 w-5" /> تأكيد التفريغ ({pendingUnload})</Button>}
        shipments={unloadShipments}
        action={(formData) => driverConfirmUnloadAction(tripId, stopId, formData)}
      />
    );
  }

  if (loadingEnabled && pendingLoad > 0) {
    steps.push(
      <Button
        key="load"
        className={cls}
        variant={look}
        disabled={pending}
        onClick={() =>
          run(async () => {
            const r = await driverConfirmLoadAction(tripId, stopId);
            if ("error" in r) { toast.error(r.error); return; }
            router.refresh();
            toast.success(`تم تحميل ${r.shipmentsLoaded} شحنة`);
          })
        }
      >
        <PackageCheck className="h-5 w-5" /> تأكيد التحميل ({pendingLoad})
      </Button>
    );
  }

  if (!departed) {
    const leftBehind = (unloadingEnabled ? pendingUnload : 0) + (loadingEnabled ? pendingLoad : 0);
    const departButton = (
      <Button
        key="depart"
        className={cls}
        variant={primary ? "default" : "outline"}
        disabled={pending}
        onClick={
          // Guarded below when work is still pending here, so this handler only ever runs for the
          // clean case: everything at this stop is done and the truck is simply leaving.
          leftBehind > 0
            ? undefined
            : () =>
                run(async () => {
                  const r = await driverDepartStopAction(tripId, stopId);
                  if (r?.error) { toast.error(r.error); return; }
                  router.refresh();
                  toast.success("تمت مغادرة المحطة");
                })
        }
      >
        <ArrowLeftCircle className="h-5 w-5" /> مغادرة المحطة
      </Button>
    );

    /*
      Departing is the one driver action with no way back.

      `departStop` moves every onboard shipment LOADED -> IN_TRANSIT, writes a TrackingEvent, and
      dispatches the WhatsApp messages that tell customers their cartons have left. Nothing in the
      product un-sends those. A mis-tap at a branch where boxes are still on the ground therefore
      costs a wrong message to someone else's customer, plus cargo that rode past its stop.

      So the tap is confirmed ONLY when this stop still has pending work — the case where the tap is
      probably a mistake. When everything here is done, departing is the expected next step and gets
      no dialog at all: a confirmation the driver always says yes to is a confirmation they stop
      reading, which is exactly how the real one gets clicked through.
    */
    steps.push(
      leftBehind > 0 ? (
        <FormDialog
          key="depart"
          trigger={departButton}
          title="مغادرة المحطة قبل إنهاء العمل؟"
          description={
            <>
              ما زال في هذه المحطة{" "}
              {unloadingEnabled && pendingUnload > 0 && <b>{pendingUnload} شحنة للتفريغ</b>}
              {unloadingEnabled && pendingUnload > 0 && loadingEnabled && pendingLoad > 0 && " و"}
              {loadingEnabled && pendingLoad > 0 && <b>{pendingLoad} شحنة للتحميل</b>}. المغادرة
              تُسجّل خروج الشاحنة وتُبلّغ العملاء بأن شحناتهم في الطريق — ولا يمكن التراجع عنها.
            </>
          }
          submitLabel="نعم، غادرت المحطة"
          submitVariant="destructive"
          successMessage="تمت مغادرة المحطة"
          action={() => driverDepartStopAction(tripId, stopId)}
        >
          {/* No fields: the decision is the whole form. FormDialog carries the submit behaviour and
              the Arabic error surfacing that every other confirm in the product already uses. */}
          <></>
        </FormDialog>
      ) : (
        departButton
      )
    );
  }

  if (steps.length === 0) return null;
  // Primary takes the head of the chain and nothing else: one action, one thumb, one place on the
  // screen it always appears. Completing it re-renders the page and the next step takes its place.
  //
  // The current stop always has at least one step by construction — it is the first stop not yet
  // departed, so "مغادرة المحطة" is always available to it — which is what lets the sticky bar
  // decide between "work at this stop" and "finish the trip" on `currentIndex` alone.
  const shown = primary ? steps.slice(0, 1) : skipFirst ? steps.slice(1) : steps;
  if (shown.length === 0) return null;
  return <div className="flex flex-col gap-2">{shown}</div>;
}
