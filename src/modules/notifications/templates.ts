import type { ShipmentEvent } from "@/lib/enums";

// Default Arabic WhatsApp copy per event, used for the mock provider's log/preview and as the
// human-readable NotificationLog.message regardless of which provider actually sends the message.
// Placeholders: {{shipmentNumber}} {{companyName}} {{customerName}} {{branchName}} {{cartonCount}}
// {{arrivedCartons}} {{totalCartons}} {{trackingUrl}}
export const DEFAULT_TEMPLATES: Record<ShipmentEvent, string> = {
  SHIPMENT_RECEIVED: "*{{companyName}}*\n📦 تم استلام شحنتك {{shipmentNumber}} في فرع {{branchName}}.\nعدد الكراتين: {{totalCartons}}",
  SHIPMENT_LOADED: "*{{companyName}}*\n🚛 تم تحميل شحنتك {{shipmentNumber}} على الرحلة {{tripNumber}}.",
  TRIP_DEPARTED: "*{{companyName}}*\nغادرت رحلة شحنتك {{shipmentNumber}} من {{branchName}}.",
  INTERMEDIATE_UPDATE: "*{{companyName}}*\nشحنتك {{shipmentNumber}} مرّت بمحطة {{branchName}} وهي في طريقها للوجهة.",
  CUSTOMS_HOLD: "*{{companyName}}*\n⚠️ شحنتك {{shipmentNumber}} محجوزة جمركياً. سيتواصل معك فريقنا.",
  SHIPMENT_ARRIVED: "*{{companyName}}*\n📦 وصلت شحنتك {{shipmentNumber}} إلى فرع {{branchName}}.\nعدد الكراتين: {{totalCartons}}\nاختر طريقة الاستلام: استلام من الفرع أو طلب توصيل إلى المنزل.\n{{trackingUrl}}",
  SHIPMENT_PARTIALLY_ARRIVED: "*{{companyName}}*\nوصل {{arrivedCartons}} من أصل {{totalCartons}} كراتين لشحنتك {{shipmentNumber}} إلى فرع {{branchName}}.",
  READY_FOR_PICKUP: "*{{companyName}}*\nشحنتك {{shipmentNumber}} جاهزة للاستلام من فرع {{branchName}}.",
  DELIVERY_REQUESTED: "*{{companyName}}*\nتم استلام طلب توصيل شحنتك {{shipmentNumber}} إلى المنزل. سنوافيك بموعد التوصيل قريباً.",
  DRIVER_ASSIGNED: "*{{companyName}}*\nتم تعيين سائق لتوصيل شحنتك {{shipmentNumber}}.",
  OUT_FOR_DELIVERY: "*{{companyName}}*\n🚚 شحنتك {{shipmentNumber}} في الطريق إليك الآن.",
  SHIPMENT_DELIVERED: "*{{companyName}}*\n✅ تم تسليم شحنتك {{shipmentNumber}} بنجاح. شكراً لثقتك بنا.",
  EXCEPTION: "*{{companyName}}*\n⚠️ هناك ملاحظة بخصوص شحنتك {{shipmentNumber}}. سيتواصل معك فريقنا.",
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
        customerName: string;
        shipmentNumber: string;
        branchName: string;
        totalCartons: number;
        arrivedCartons: number;
        trackingUrl: string;
      }) => string[];
    }
  >
> = {
  SHIPMENT_RECEIVED: {
    name: "shipment_received",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber, v.branchName, String(v.totalCartons)],
  },
  TRIP_DEPARTED: {
    name: "shipment_departed",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber, v.branchName],
  },
  SHIPMENT_ARRIVED: {
    name: "shipment_arrived",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber, v.branchName, String(v.totalCartons), v.trackingUrl],
  },
  SHIPMENT_PARTIALLY_ARRIVED: {
    name: "shipment_partial_arrival",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber, String(v.totalCartons), String(v.arrivedCartons)],
  },
  DELIVERY_REQUESTED: {
    name: "delivery_requested",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber],
  },
  OUT_FOR_DELIVERY: {
    name: "out_for_delivery",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber],
  },
  SHIPMENT_DELIVERED: {
    name: "shipment_delivered",
    language: "ar_AE",
    buildParams: (v) => [v.companyName, v.customerName, v.shipmentNumber],
  },
};
