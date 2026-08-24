import { getShipmentByTrackingToken } from "@/modules/shipments/service";

/**
 * The exact shape the public tracking view renders — and the only shape that ever leaves the
 * server on an unauthenticated request.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A VIEW MODEL AND NOT THE PRISMA ROW
 * ---------------------------------------------------------------------------------------------
 * There are now two ways to reach the tracking view: the tracking link from WhatsApp
 * (/track/<token>) and the public lookup form (/track). Handing each of them a Prisma row and
 * letting each pick fields would mean two allow-lists that drift — and on a page with no session,
 * a field that drifts in is a field the whole internet can read.
 *
 * So both paths funnel through `toTrackedView`, which names every field explicitly. Anything not
 * listed here cannot reach a public page by accident: not the customer (the SENDER — a different
 * person from the receiver, and not the audience of this page), not the receiver's phone number,
 * not prices or amounts paid, not internal notes, not the trip, its driver or its vehicle.
 *
 * `trackingToken` is deliberately ABSENT. It is the credential that authorizes the two actions
 * which physically redirect cartons (see src/app/track/[token]/actions.ts), so it must never be
 * derivable from anything the lookup form returns. See the lookup action for the full reasoning.
 */
export type TrackedShipment = {
  shipmentNumber: string;
  status: string;
  /** When the office took the cartons in — "تاريخ الشحن" on the result card. Public by nature: it
   *  is printed on the customer's own receipt. */
  createdAt: Date;
  totalCartons: number;
  arrivedCartons: number;
  updatedAt: Date;
  company: { name: string; logoColor: string; phone: string | null };
  loadBranch: { city: string };
  /** The branch the customer collects from — now with its own way to be reached. Falling back to
   *  the company's switchboard was never right for a multi-branch carrier: a customer asking "is
   *  it on the shelf" needs the shelf's phone, not head office. */
  unloadBranch: { name: string; city: string; phone: string | null; address: string | null };
  /** Planned arrival at the stop where this shipment gets unloaded, when it is still ahead. */
  plannedArrival: Date | null;
  deliveredAt: Date | null;
  deliveredToName: string | null;
  deliveryRequestStatus: string | null;
  /**
   * What the customer INTENDED, chosen on this page and possibly never acted on.
   *
   * Kept because it is what the pickup/delivery controls read back, but it is NOT the fact the
   * result card states — see `deliveryChannel`.
   */
  deliveryMethod: string | null;
  /**
   * How the cartons ACTUALLY reached whoever took them, recorded at handover in the same
   * transaction as the DELIVERED transition (see the schema comment on Shipment.deliveryChannel).
   *
   * The card was printing `deliveryMethod` and therefore said "لم تُحدَّد بعد" on shipments that
   * had already been handed over — an intention nobody had recorded, on a shipment whose real
   * outcome was sitting one column away. Null until handover, and the card omits the cell rather
   * than printing an absence.
   */
  deliveryChannel: string | null;
  /**
   * The customer-visible tracking events, oldest first — the timeline itself.
   *
   * `description` rides along because the timeline states what happened AND where ("غادرت الرحلة
   * من فرع الرياض"), which is the second line under each node. Both fields are already written for
   * a customer to read: `isCustomerVisible` is the gate staff set, and nothing internal reaches
   * here.
   *
   * Capped at 12 rather than 4. The card now renders these as the timeline instead of a four-row
   * "latest updates" footnote, and a shipment that crossed three branches has more than four real
   * milestones. Still a cap: this is a public payload on a metered connection, and nobody scrolls
   * a year of a parcel's life.
   *
   * Deliberately still absent: `goodsType`. It describes what is INSIDE the box, and the lookup
   * path means a guessed shipment number plus a 10,000-space digit guess would read it. The card
   * shows how the shipment is being handled (deliveryMethod) instead — the fact a customer asks
   * about, with nothing new exposed.
   */
  events: { id: string; title: string; description: string | null; createdAt: Date }[];
};

type SourceShipment = NonNullable<Awaited<ReturnType<typeof getShipmentByTrackingToken>>>;

export function toTrackedView(shipment: SourceShipment): TrackedShipment {
  return {
    shipmentNumber: shipment.shipmentNumber,
    status: shipment.status,
    createdAt: shipment.createdAt,
    totalCartons: shipment.totalCartons,
    arrivedCartons: shipment.arrivedCartons,
    updatedAt: shipment.updatedAt,
    company: {
      name: shipment.company.name,
      logoColor: shipment.company.logoColor,
      phone: shipment.company.phone,
    },
    loadBranch: { city: shipment.loadBranch.city },
    unloadBranch: {
      name: shipment.unloadBranch.name,
      city: shipment.unloadBranch.city,
      phone: shipment.unloadBranch.phone,
      address: shipment.unloadBranch.address,
    },
    plannedArrival: shipment.tripLinks[0]?.unloadStop?.plannedArrival ?? null,
    deliveredAt: shipment.deliveredAt,
    deliveredToName: shipment.deliveredToName,
    deliveryRequestStatus: shipment.deliveryRequest?.status ?? null,
    deliveryMethod: shipment.deliveryMethod,
    deliveryChannel: shipment.deliveryChannel,
    // Sliced here rather than in the view, so the cap is a property of what leaves the server
    // rather than of what one component happens to render.
    events: shipment.trackingEvents
      .slice(-12)
      .map((e) => ({ id: e.id, title: e.title, description: e.description, createdAt: e.createdAt })),
  };
}
