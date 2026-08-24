"use client";

import { ActionButton } from "@/components/shell/action-button";
import { Ban, X } from "lucide-react";
import { cancelTripAction, unassignShipmentAction } from "../actions";

/**
 * Calling off a trip that has not started.
 *
 * Confirmed, because it is not reversible from the UI (there is no un-cancel) and because it
 * releases every shipment reserved for the trip — the office needs to know that before the tap, not
 * after. The server refuses once anything was loaded or any stop departed, so the button is only
 * ever offered for a plan, never for history.
 */
export function CancelTripButton({ tripId, shipmentCount }: { tripId: string; shipmentCount: number }) {
  return (
    <ActionButton
      variant="destructive"
      icon={Ban}
      action={() => cancelTripAction(tripId)}
      successMessage="تم إلغاء الرحلة"
      confirmMessage={
        shipmentCount > 0
          ? `سيتم إلغاء الرحلة وفك ارتباط ${shipmentCount} شحنة لتصبح متاحة لرحلة أخرى. لا يمكن التراجع.`
          : "سيتم إلغاء الرحلة. لا يمكن التراجع."
      }
    >
      إلغاء الرحلة
    </ActionButton>
  );
}

/**
 * Takes one shipment back off the trip — the undo the assign dialog never had.
 *
 * Rendered only for a link that has not been loaded; the server enforces the same rule, so a stale
 * page cannot unlink cargo that is already on a truck.
 */
export function RemoveShipmentButton({ tripId, linkId, shipmentNumber }: { tripId: string; linkId: string; shipmentNumber: string }) {
  return (
    <ActionButton
      variant="ghost"
      size="sm"
      icon={X}
      action={() => unassignShipmentAction(tripId, linkId)}
      successMessage="تمت إزالة الشحنة من الرحلة"
      confirmMessage={`إزالة الشحنة ${shipmentNumber} من هذه الرحلة؟ ستعود متاحة للربط برحلة أخرى.`}
    >
      إزالة
    </ActionButton>
  );
}
