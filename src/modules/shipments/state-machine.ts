import type { ShipmentStatus } from "@/lib/enums";

const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: ["REGISTERED", "CANCELLED"],
  REGISTERED: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["READY_FOR_LOADING", "CANCELLED", "EXCEPTION"],
  READY_FOR_LOADING: ["LOADED", "CANCELLED", "EXCEPTION"],
  LOADED: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["AT_INTERMEDIATE_STOP", "PARTIALLY_ARRIVED", "ARRIVED", "EXCEPTION"],
  AT_INTERMEDIATE_STOP: ["IN_TRANSIT", "LOADED", "PARTIALLY_ARRIVED", "ARRIVED", "EXCEPTION"],
  // A shipment that arrived short can still be handed over — the customer takes the cartons that
  // did arrive. Without these two edges the only way out of PARTIALLY_ARRIVED was
  // confirmRemainingArrived (which asserts the rest turned up) or a detour through EXCEPTION, so a
  // permanently lost carton left the shipment stuck or forced the record to lie about it.
  PARTIALLY_ARRIVED: ["ARRIVED", "READY_FOR_PICKUP", "DELIVERY_REQUESTED", "EXCEPTION"],
  // A customer/branch can request home delivery the moment a shipment arrives — READY_FOR_PICKUP
  // is not a mandatory gate in front of it (see DeliveryPanel, which offers the choice from ARRIVED).
  ARRIVED: ["READY_FOR_PICKUP", "DELIVERY_REQUESTED", "EXCEPTION"],
  READY_FOR_PICKUP: ["DELIVERY_REQUESTED", "DELIVERED", "EXCEPTION"],
  // Both delivery stages can fall back to the counter. A home delivery that was cancelled before it
  // left, or attempted and failed, leaves the cartons exactly where they were — in the destination
  // branch, waiting for their owner. Without these edges the delivery request had only one way out
  // (a successful delivery), so a customer who was not home left the request open forever.
  DELIVERY_REQUESTED: ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "READY_FOR_PICKUP", "EXCEPTION"],
  DELIVERED: [],
  CANCELLED: [],
  // The coarse gate only. Which of these a *particular* shipment may return to depends on where it
  // physically was when the exception was raised — see exceptionRecoveryTargets below, which is the
  // rule resolveException actually enforces.
  EXCEPTION: [
    "RECEIVED",
    "READY_FOR_LOADING",
    "LOADED",
    "IN_TRANSIT",
    "PARTIALLY_ARRIVED",
    "ARRIVED",
    "READY_FOR_PICKUP",
    "DELIVERY_REQUESTED",
    "OUT_FOR_DELIVERY",
    "CANCELLED",
  ],
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ShipmentStatus, to: ShipmentStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`انتقال حالة غير مسموح: ${from} -> ${to}`);
  }
}

/**
 * Where a shipment may go when its exception is resolved.
 *
 * A flat "EXCEPTION can become anything" list is wrong in both directions. Too narrow and real
 * situations dead-end: an exception raised on a PARTIALLY_ARRIVED shipment could not be resolved at
 * all, because the resolve action returns the shipment to the status it held before, and that
 * status was not on the list — the employee's only remaining button was "cancel the shipment",
 * for cargo physically sitting in the destination branch. Too wide and the machine allows
 * nonsense: a shipment that never reached its destination could be marked "out for delivery".
 *
 * So the allowed set is derived from where the shipment actually was. Every list contains the
 * status it came from (undo the exception), the natural next step or two from there, and CANCELLED
 * (some goods really are written off). Nothing lets a shipment skip a physical stage it never
 * completed.
 *
 * The three at-a-branch states (PARTIALLY_ARRIVED, ARRIVED, READY_FOR_PICKUP) additionally allow
 * READY_FOR_LOADING: cartons sitting in a branch can be put back on a truck, which is what actually
 * happens when a shipment reaches the wrong branch or has to be forwarded. That is not skipping a
 * stage — loading is exactly what a branch does with goods it holds.
 */
export function exceptionRecoveryTargets(statusBeforeException: ShipmentStatus | null | undefined): ShipmentStatus[] {
  switch (statusBeforeException) {
    case "RECEIVED":
      return ["RECEIVED", "READY_FOR_LOADING", "CANCELLED"];
    case "READY_FOR_LOADING":
      return ["READY_FOR_LOADING", "RECEIVED", "CANCELLED"];
    case "LOADED":
      return ["LOADED", "IN_TRANSIT", "CANCELLED"];
    // Still on the road: it can carry on, or it can be recorded as having reached the branch —
    // in full or short. It cannot jump to pickup/delivery, which presuppose an arrival.
    case "IN_TRANSIT":
    case "AT_INTERMEDIATE_STOP":
      return ["IN_TRANSIT", "ARRIVED", "PARTIALLY_ARRIVED", "CANCELLED"];
    // Arrived short. The missing carton may turn up (ARRIVED), or the customer takes what did
    // arrive (READY_FOR_PICKUP) — the handover paths preserve the missing carton either way.
    case "PARTIALLY_ARRIVED":
      return ["PARTIALLY_ARRIVED", "ARRIVED", "READY_FOR_PICKUP", "READY_FOR_LOADING", "CANCELLED"];
    case "ARRIVED":
      return ["ARRIVED", "READY_FOR_PICKUP", "DELIVERY_REQUESTED", "READY_FOR_LOADING", "CANCELLED"];
    case "READY_FOR_PICKUP":
      return ["READY_FOR_PICKUP", "DELIVERY_REQUESTED", "READY_FOR_LOADING", "CANCELLED"];
    // A home delivery that hit a problem: retry the delivery, or fall back to branch pickup. Both
    // are real outcomes in this market, and neither was reachable before.
    case "DELIVERY_REQUESTED":
      return ["DELIVERY_REQUESTED", "READY_FOR_PICKUP", "CANCELLED"];
    case "OUT_FOR_DELIVERY":
      return ["OUT_FOR_DELIVERY", "READY_FOR_PICKUP", "CANCELLED"];
    // No recorded prior status (older rows, or an exception raised at intake): the shipment is at
    // a branch and nothing about its journey can be assumed.
    default:
      return ["RECEIVED", "CANCELLED"];
  }
}

/** Business wording for a recovery choice — the employee picks an action, never an enum. */
export const RECOVERY_ACTION_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "إعادة إلى المسودة",
  REGISTERED: "إعادة إلى التسجيل",
  RECEIVED: "إعادتها إلى الفرع",
  READY_FOR_LOADING: "تجهيزها للتحميل",
  LOADED: "إعادتها محمّلة على الرحلة",
  IN_TRANSIT: "إعادتها إلى الطريق",
  AT_INTERMEDIATE_STOP: "إعادتها إلى المحطة الوسيطة",
  PARTIALLY_ARRIVED: "إعادتها إلى الوصول الجزئي",
  ARRIVED: "تأكيد وصولها إلى الفرع",
  READY_FOR_PICKUP: "تجهيزها لاستلام العميل",
  DELIVERY_REQUESTED: "إعادة طلب التوصيل",
  OUT_FOR_DELIVERY: "إعادة محاولة التوصيل",
  DELIVERED: "تأكيد التسليم",
  CANCELLED: "إلغاء الشحنة",
  EXCEPTION: "إبقاؤها استثناءً",
};
