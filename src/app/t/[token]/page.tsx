import { getShipmentByTrackingToken } from "@/modules/shipments/service";
import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/app-url";
import { PickupOrDeliveryChoice } from "./pickup-or-delivery-choice";
import { TrackingView } from "@/app/track/tracking-view";
import { TrackShell } from "@/app/track/track-shell";
import { toTrackedView } from "@/app/track/tracked-shipment";
import { carrierFromCompany } from "@/app/track/tenant";

/**
 * The tracking page reached by the customer's own link — the one WhatsApp sends.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY /t/<token> AND NOT /track/<token>
 * ---------------------------------------------------------------------------------------------
 * The branded lookup lives at /track/<company>, and both would be a single dynamic segment under
 * /track. Two sibling dynamic segments cannot coexist, and disambiguating them by guessing whether
 * a string is a slug or a token would make routing depend on lookup order — a rule that breaks the
 * first time a carrier picks a slug that looks like a token.
 *
 * The shorter path is also the better one for the job: this URL's whole life is inside a WhatsApp
 * message, where every character is visible.
 *
 * This route is the ONLY one that renders the pickup / home-delivery controls and the share
 * control, because holding the token is what both are authorized on. Keyed by the unguessable
 * token, never by shipmentNumber — see src/lib/tracking.ts. An unknown token is a plain 404 with no
 * hint that some other token would have worked.
 */
export default async function TrackShipmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shipment = await getShipmentByTrackingToken(token);
  if (!shipment) notFound();

  const view = toTrackedView(shipment);
  // The carrier is known here because the SHIPMENT is known — the opposite direction from the
  // lookup, same resulting shape, so both pages are dressed identically.
  const carrier = carrierFromCompany(shipment.company);
  const isArrivedStage = ["ARRIVED", "PARTIALLY_ARRIVED", "READY_FOR_PICKUP"].includes(view.status);
  const canChoose = isArrivedStage && view.status !== "DELIVERED";

  return (
    <TrackShell carrier={carrier}>
      <div className="mx-auto w-full max-w-2xl pt-2">
        <TrackingView
          shipment={view}
          carrier={carrier}
          shareUrl={absoluteUrl(`/t/${token}`)}
          actions={
            canChoose ? (
              <PickupOrDeliveryChoice
                token={token}
                deliveryMethod={view.deliveryMethod}
                hasPendingRequest={view.deliveryRequestStatus === "PENDING"}
              />
            ) : undefined
          }
        />
      </div>
    </TrackShell>
  );
}
