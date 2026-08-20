import type { ShipmentEvent, NotificationRecipient } from "@/lib/enums";

// Default Arabic WhatsApp copy per event, used for the mock provider's log/preview and as the
// human-readable NotificationLog.message regardless of which provider actually sends the message.
// Placeholders: {{shipmentNumber}} {{companyName}} {{recipientName}} {{branchName}} {{cartonCount}}
// {{arrivedCartons}} {{totalCartons}} {{trackingUrl}} {{shortageNote}}
//
// Every body says "شحنتك" — correct for either party only because EVENT_RECIPIENTS below routes
// each event to the one side it actually reads true for. Wording that assumes a direction ("إليك")
// belongs only in an event routed to the party that direction points at.
export const DEFAULT_TEMPLATES: Record<ShipmentEvent, string> = {
  // {{trackingUrl}} added here on purpose, and this is the only event that carries it to the
  // SENDER. Before, the tracking link appeared in exactly one template — SHIPMENT_ARRIVED, routed
  // to RECEIVER — so the person who paid for the shipment and who calls the office to ask where it
  // is never received a link at all. "Give your customer a tracking link" is the product's headline
  // promise, and the paying customer was the one party it was never kept for. Intake is the right
  // moment: it is the first message they get, and the link is live from that instant onwards.
  // Recipient routing is unchanged (still CUSTOMER) — this adds a link, not an audience.
  SHIPMENT_RECEIVED:
    "*{{companyName}}*\n📦 تم استلام شحنتك {{shipmentNumber}} في فرع {{branchName}}.\nعدد الكراتين: {{totalCartons}}\nتابع شحنتك: {{trackingUrl}}",
  // No {{tripNumber}}: the dispatch for this event (confirmBulkLoad) passes no extra vars, so the
  // placeholder always rendered empty — "على الرحلة ." — and a trip number is internal routing
  // detail the customer has no use for anyway.
  // "إليك" was wrong here and always had been: this event is routed to the sender, who is not where
  // the truck is heading. Only the receiver-routed events may say the shipment is coming "to you".
  SHIPMENT_LOADED: "*{{companyName}}*\n🚛 تم تحميل شحنتك {{shipmentNumber}} وهي في طريقها إلى وجهتها.",
  TRIP_DEPARTED: "*{{companyName}}*\nغادرت رحلة شحنتك {{shipmentNumber}} من {{branchName}}.",
  INTERMEDIATE_UPDATE: "*{{companyName}}*\nشحنتك {{shipmentNumber}} مرّت بمحطة {{branchName}} وهي في طريقها للوجهة.",
  CUSTOMS_HOLD: "*{{companyName}}*\n⚠️ شحنتك {{shipmentNumber}} محجوزة جمركياً. سيتواصل معك فريقنا.",
  SHIPMENT_ARRIVED: "*{{companyName}}*\n📦 وصلت شحنتك {{shipmentNumber}} إلى فرع {{branchName}}.\nعدد الكراتين: {{totalCartons}}\nاختر طريقة الاستلام: استلام من الفرع أو طلب توصيل إلى المنزل.\n{{trackingUrl}}",
  SHIPMENT_PARTIALLY_ARRIVED: "*{{companyName}}*\nوصل {{arrivedCartons}} من أصل {{totalCartons}} كراتين لشحنتك {{shipmentNumber}} إلى فرع {{branchName}}.",
  READY_FOR_PICKUP: "*{{companyName}}*\nشحنتك {{shipmentNumber}} جاهزة للاستلام من فرع {{branchName}}.",
  DELIVERY_REQUESTED: "*{{companyName}}*\nتم استلام طلب توصيل شحنتك {{shipmentNumber}} إلى المنزل. سنوافيك بموعد التوصيل قريباً.",
  DRIVER_ASSIGNED: "*{{companyName}}*\nتم تعيين سائق لتوصيل شحنتك {{shipmentNumber}}.",
  OUT_FOR_DELIVERY: "*{{companyName}}*\n🚚 شحنتك {{shipmentNumber}} في الطريق إليك الآن.",
  // "بنجاح" was a claim the system could not always back: a shipment handed over one carton short
  // was announced as a clean delivery. {{shortageNote}} is empty for a complete handover and names
  // the shortfall otherwise — dispatchShipmentEvent builds it from the missing carton count.
  SHIPMENT_DELIVERED: "*{{companyName}}*\n✅ تم تسليم شحنتك {{shipmentNumber}}.{{shortageNote}}\nشكراً لثقتك بنا.",
  EXCEPTION: "*{{companyName}}*\n⚠️ هناك ملاحظة بخصوص شحنتك {{shipmentNumber}}. سيتواصل معك فريقنا.",
};

/**
 * Which party each event is addressed to — the product rule this module exists to encode.
 *
 * Before this map every message went to Shipment.customer, i.e. whoever handed the cartons over at
 * origin. For half of these events that is the wrong human: OUT_FOR_DELIVERY's "شحنتك في الطريق
 * إليك الآن" was reaching the sender, who is not where the truck is going, while the person waiting
 * at the destination got nothing at all. The split:
 *
 * - CUSTOMER (sender) gets the events about their own side of the handover — we have your goods
 *   (RECEIVED), they are loaded (LOADED), and the closing receipt (DELIVERED) — plus anything that
 *   concerns liability for the goods themselves (CUSTOMS_HOLD, EXCEPTION), which is the sender's to
 *   settle with the office, not the receiver's.
 * - RECEIVER gets everything about the cartons approaching and reaching *them*: transit progress,
 *   arrival, pickup readiness, and the whole home-delivery sequence — including the ARRIVED message,
 *   which carries the pickup-or-delivery call to action and the tracking link.
 * - TRIP_DEPARTED is the single deliberate both: the sender needs "it actually left", the receiver
 *   needs a heads-up before the cartons simply turn up. Every other event has exactly one correct
 *   audience, and sending it to both would be the WhatsApp noise real customers block over.
 *
 * DELIVERED is sender-only on purpose: at that moment the receiver is holding the cartons and
 * learns nothing from a message telling them so.
 *
 * This map is independent of META_TEMPLATES below. Routing decides *who*; META_TEMPLATES decides
 * whether the real provider has an approved template to send at all. An event can be correctly
 * routed and still SKIPPED under the Meta provider (READY_FOR_PICKUP is — SHIPMENT_ARRIVED already
 * carries its call to action, so no eighth template was added for it).
 */
export const EVENT_RECIPIENTS: Record<ShipmentEvent, readonly NotificationRecipient[]> = {
  SHIPMENT_RECEIVED: ["CUSTOMER"],
  SHIPMENT_LOADED: ["CUSTOMER"],
  TRIP_DEPARTED: ["CUSTOMER", "RECEIVER"],
  INTERMEDIATE_UPDATE: ["RECEIVER"],
  CUSTOMS_HOLD: ["CUSTOMER"],
  SHIPMENT_ARRIVED: ["RECEIVER"],
  SHIPMENT_PARTIALLY_ARRIVED: ["RECEIVER"],
  READY_FOR_PICKUP: ["RECEIVER"],
  DELIVERY_REQUESTED: ["RECEIVER"],
  DRIVER_ASSIGNED: ["RECEIVER"],
  OUT_FOR_DELIVERY: ["RECEIVER"],
  SHIPMENT_DELIVERED: ["CUSTOMER"],
  EXCEPTION: ["CUSTOMER"],
};

export function renderTemplate(body: string, vars: Record<string, string | number | undefined>) {
  return body.replace(/{{\s*(\w+)\s*}}/g, (_, key) => String(vars[key] ?? ""));
}

/**
 * Events that genuinely need a customer-facing WhatsApp message, mapped to a Meta-approved
 * template. The real WhatsApp Business Platform only accepts pre-approved templates (name +
 * language + ordered positional parameters) for business-initiated messages — arbitrary body text
 * (DEFAULT_TEMPLATES above) only works for the mock provider. Deliberately NOT every ShipmentEvent:
 * internal/operational events (loaded, intermediate stop, ready-for-pickup, driver-assigned,
 * exception, customs-hold) stay tracking-only rather than becoming customer WhatsApp noise — see
 * the "SKIPPED" status this produces in dispatchShipmentEvent when the real provider is active.
 *
 * `name` here is exactly the template name to create (and get approved) in Meta's Template
 * Manager, using `language` as its language, with a body containing {{1}}..{{n}} placeholders in
 * this same order. buildParams must always return them in that exact order.
 */
export const META_TEMPLATES: Partial<
  Record<
    ShipmentEvent,
    {
      name: string;
      language: string;
      buildParams: (vars: {
        companyName: string;
        // The greeting slot of the approved template. Populated with whichever party this dispatch
        // is addressed to (EVENT_RECIPIENTS), not necessarily the customer — the positional order
        // Meta approved is untouched, only the name that fills it.
        recipientName: string;
        shipmentNumber: string;
        branchName: string;
        totalCartons: number;
        arrivedCartons: number;
        trackingUrl: string;
      }) => string[];
    }
  >
> = {
  // Six parameters, not five: the sixth is the tracking URL (see DEFAULT_TEMPLATES above for why
  // the sender needs one). No new template is being added — `shipment_received` simply has to be
  // created in Meta's Template Manager with {{6}} in its body, which costs nothing extra because
  // none of these seven templates has been submitted for approval yet. Doing this after approval
  // would have required a resubmission; doing it now does not.
  SHIPMENT_RECEIVED: {
    name: "shipment_received",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.recipientName, v.shipmentNumber, v.branchName, String(v.totalCartons), v.trackingUrl],
  },
  TRIP_DEPARTED: {
    name: "shipment_departed",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.recipientName, v.shipmentNumber, v.branchName],
  },
  SHIPMENT_ARRIVED: {
    name: "shipment_arrived",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.recipientName, v.shipmentNumber, v.branchName, String(v.totalCartons), v.trackingUrl],
  },
  // Six parameters: the branch name is {{6}}, appended rather than inserted so the five already
  // agreed positions keep their meaning. A short arrival is the most dispute-prone event in this
  // product, and the message used to tell the receiver that cartons were missing without telling
  // them which branch is holding the ones that did arrive — the default Arabic body (above) has
  // always named the branch, so this also stops the sent message and the office's own log from
  // describing the same event differently.
  SHIPMENT_PARTIALLY_ARRIVED: {
    name: "shipment_partial_arrival",
    language: "ar_AE",
    buildParams: (v) => [
      v.companyName,
      v.recipientName,
      v.shipmentNumber,
      String(v.totalCartons),
      String(v.arrivedCartons),
      v.branchName,
    ],
  },
  DELIVERY_REQUESTED: {
    name: "delivery_requested",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.recipientName, v.shipmentNumber],
  },
  OUT_FOR_DELIVERY: {
    name: "out_for_delivery",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.recipientName, v.shipmentNumber],
  },
  SHIPMENT_DELIVERED: {
    name: "shipment_delivered",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.recipientName, v.shipmentNumber],
  },
};
