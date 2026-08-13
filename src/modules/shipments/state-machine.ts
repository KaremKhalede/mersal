import type { ShipmentStatus } from "@/lib/enums";

const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  DRAFT: ["REGISTERED", "CANCELLED"],
  REGISTERED: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["READY_FOR_LOADING", "CANCELLED", "EXCEPTION"],
  READY_FOR_LOADING: ["LOADED", "CANCELLED", "EXCEPTION"],
  LOADED: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["AT_INTERMEDIATE_STOP", "PARTIALLY_ARRIVED", "ARRIVED", "EXCEPTION"],
  AT_INTERMEDIATE_STOP: ["IN_TRANSIT", "LOADED", "PARTIALLY_ARRIVED", "ARRIVED", "EXCEPTION"],
  PARTIALLY_ARRIVED: ["ARRIVED", "EXCEPTION"],
  // A customer/branch can request home delivery the moment a shipment arrives — READY_FOR_PICKUP
  // is not a mandatory gate in front of it (see DeliveryPanel, which offers the choice from ARRIVED).
  ARRIVED: ["READY_FOR_PICKUP", "DELIVERY_REQUESTED", "EXCEPTION"],
  READY_FOR_PICKUP: ["DELIVERY_REQUESTED", "DELIVERED", "EXCEPTION"],
  DELIVERY_REQUESTED: ["OUT_FOR_DELIVERY", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "EXCEPTION"],
  DELIVERED: [],
  CANCELLED: [],
  EXCEPTION: ["RECEIVED", "READY_FOR_LOADING", "LOADED", "IN_TRANSIT", "ARRIVED", "READY_FOR_PICKUP", "CANCELLED"],
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: ShipmentStatus, to: ShipmentStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`انتقال حالة غير مسموح: ${from} -> ${to}`);
  }
}
