// Central string-union "enums" — Prisma fields are String (SQLite has no native enum type).

export const SHIPMENT_STATUSES = [
  "DRAFT",
  "REGISTERED",
  "RECEIVED",
  "READY_FOR_LOADING",
  "LOADED",
  "IN_TRANSIT",
  "AT_INTERMEDIATE_STOP",
  "PARTIALLY_ARRIVED",
  "ARRIVED",
  "READY_FOR_PICKUP",
  "DELIVERY_REQUESTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "EXCEPTION",
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  DRAFT: "مسودة",
  REGISTERED: "مسجّلة",
  RECEIVED: "تم الاستلام",
  READY_FOR_LOADING: "جاهزة للتحميل",
  LOADED: "تم التحميل",
  IN_TRANSIT: "في الطريق",
  AT_INTERMEDIATE_STOP: "في محطة وسيطة",
  PARTIALLY_ARRIVED: "وصول جزئي",
  ARRIVED: "وصلت الوجهة",
  READY_FOR_PICKUP: "جاهزة للاستلام",
  DELIVERY_REQUESTED: "طلب توصيل",
  OUT_FOR_DELIVERY: "قيد التوصيل",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغاة",
  EXCEPTION: "استثناء",
};

// Simplified customer-facing timeline steps (internal statuses collapse into these).
export const CUSTOMER_TIMELINE_STEPS = [
  { key: "RECEIVED", label: "تم استلام الشحنة", statuses: ["REGISTERED", "RECEIVED"] },
  { key: "LOADED", label: "تم التحميل على الرحلة", statuses: ["READY_FOR_LOADING", "LOADED"] },
  { key: "IN_TRANSIT", label: "في الطريق", statuses: ["IN_TRANSIT", "AT_INTERMEDIATE_STOP", "PARTIALLY_ARRIVED"] },
  { key: "ARRIVED", label: "وصلت الفرع", statuses: ["ARRIVED"] },
  { key: "READY_FOR_PICKUP", label: "جاهزة للاستلام / التوصيل", statuses: ["READY_FOR_PICKUP", "DELIVERY_REQUESTED", "OUT_FOR_DELIVERY"] },
  { key: "DELIVERED", label: "تم التسليم", statuses: ["DELIVERED"] },
] as const;

export const CARTON_STATUSES = [
  "REGISTERED",
  "LOADED",
  "IN_TRANSIT",
  "UNLOADED",
  "ARRIVED",
  "DELIVERED",
  "MISSING",
  "DAMAGED",
] as const;
export type CartonStatus = (typeof CARTON_STATUSES)[number];

export const TRIP_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];
export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PLANNED: "مجدولة",
  IN_PROGRESS: "في الطريق",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

export const TRIP_STOP_STATUSES = ["PENDING", "ARRIVED", "LOADING", "UNLOADING", "DEPARTED", "DONE"] as const;
export type TripStopStatus = (typeof TRIP_STOP_STATUSES)[number];

// Trip stop timing signal — see src/lib/stop-timing.ts for the rule that derives this.
export const STOP_TIMINGS = ["ON_TIME", "AT_RISK", "LATE"] as const;
export type StopTiming = (typeof STOP_TIMINGS)[number];
export const STOP_TIMING_LABELS: Record<StopTiming, string> = {
  ON_TIME: "في الموعد",
  AT_RISK: "في خطر التأخر",
  LATE: "متأخر",
};
/** Same success/warning/destructive tone tokens used everywhere else in the app (StatCard, badges). */
export const STOP_TIMING_TONES: Record<StopTiming, "success" | "warning" | "destructive"> = {
  ON_TIME: "success",
  AT_RISK: "warning",
  LATE: "destructive",
};

export const CUSTOMS_STATUSES = [
  "NOT_PREPARED",
  "DOCUMENTS_REQUIRED",
  "DOCUMENTS_READY",
  "IN_CUSTOMS",
  "CLEARANCE_IN_PROGRESS",
  "CLEARED",
  "ON_HOLD",
  "EXCEPTION",
] as const;
export type CustomsStatus = (typeof CUSTOMS_STATUSES)[number];

export const CUSTOMS_STATUS_LABELS: Record<CustomsStatus, string> = {
  NOT_PREPARED: "لم تُجهّز",
  DOCUMENTS_REQUIRED: "مستندات مطلوبة",
  DOCUMENTS_READY: "المستندات جاهزة",
  IN_CUSTOMS: "في الجمارك",
  CLEARANCE_IN_PROGRESS: "التخليص جارٍ",
  CLEARED: "تم التخليص",
  ON_HOLD: "محجوزة جمركياً",
  EXCEPTION: "استثناء",
};

export const DELIVERY_STATUSES = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "قيد الانتظار",
  ASSIGNED: "تم التسليم لأرشي",
  OUT_FOR_DELIVERY: "قيد التوصيل",
  DELIVERED: "تم التوصيل",
  FAILED: "فشل التوصيل",
  CANCELLED: "ملغي",
};

export const DOCUMENT_TYPES = ["INVOICE", "CUSTOMS_DECLARATION", "ID", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: "فاتورة",
  CUSTOMS_DECLARATION: "إقرار جمركي",
  ID: "هوية",
  OTHER: "أخرى",
};

export const PAYMENT_METHODS = ["CASH", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { CASH: "نقداً", OTHER: "أخرى" };

export const EXCEPTION_TYPES = [
  "MISSING_CARTON",
  "DAMAGED",
  "NOT_LOADED",
  "WRONG_DESTINATION",
  "CUSTOMS_HOLD",
  "TRIP_DELAY",
  "CUSTOMER_NOT_COLLECTED",
  "DELIVERY_FAILED",
  "OTHER",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];
export const EXCEPTION_TYPE_LABELS: Record<ExceptionType, string> = {
  MISSING_CARTON: "كرتون ناقص",
  DAMAGED: "شحنة تالفة",
  NOT_LOADED: "شحنة لم تُحمّل",
  WRONG_DESTINATION: "وجهة خاطئة",
  CUSTOMS_HOLD: "حجز جمركي",
  TRIP_DELAY: "تأخر الرحلة",
  CUSTOMER_NOT_COLLECTED: "لم يستلم العميل",
  DELIVERY_FAILED: "فشل التوصيل",
  OTHER: "أخرى",
};

export const USER_TYPES = ["PLATFORM_ADMIN", "COMPANY_USER", "DRIVER"] as const;
export type UserType = (typeof USER_TYPES)[number];

export const SHIPMENT_EVENTS = [
  "SHIPMENT_RECEIVED",
  "SHIPMENT_LOADED",
  "TRIP_DEPARTED",
  "INTERMEDIATE_UPDATE",
  "CUSTOMS_HOLD",
  "SHIPMENT_ARRIVED",
  "SHIPMENT_PARTIALLY_ARRIVED",
  "READY_FOR_PICKUP",
  "DELIVERY_REQUESTED",
  "DRIVER_ASSIGNED",
  "OUT_FOR_DELIVERY",
  "SHIPMENT_DELIVERED",
  "EXCEPTION",
] as const;
export type ShipmentEvent = (typeof SHIPMENT_EVENTS)[number];

// Resources + actions used to build Role.permissions JSON.
export const PERMISSION_RESOURCES = {
  shipments: ["view", "create", "edit", "cancel", "updateStatus"],
  trips: ["view", "create", "edit", "assignDriver", "start", "complete"],
  branches: ["view", "create", "edit"],
  employees: ["view", "create", "edit", "disable"],
  vehicles: ["view", "create", "edit"],
  customers: ["view", "create", "edit"],
  customs: ["view", "edit"],
  documents: ["view", "upload"],
  billing: ["view", "manage", "export"],
  reports: ["view"],
  settings: ["view", "edit"],
  roles: ["view", "manage"],
} as const;
export type PermissionResource = keyof typeof PERMISSION_RESOURCES;

export const RESOURCE_LABELS: Record<PermissionResource, string> = {
  shipments: "الشحنات",
  trips: "الرحلات",
  branches: "الفروع",
  employees: "الموظفون",
  vehicles: "المركبات",
  customers: "العملاء",
  customs: "الجمارك",
  documents: "المستندات",
  billing: "المالية",
  reports: "التقارير",
  settings: "الإعدادات",
  roles: "الأدوار والصلاحيات",
};

export const ACTION_LABELS: Record<string, string> = {
  view: "عرض",
  create: "إضافة",
  edit: "تعديل",
  cancel: "إلغاء",
  updateStatus: "تحديث الحالة",
  assignDriver: "تعيين سائق",
  start: "بدء",
  complete: "إنهاء",
  disable: "تعطيل",
  upload: "رفع",
  manage: "إدارة",
  export: "تصدير",
};

export type Permissions = Partial<Record<PermissionResource, string[]>>;

export const FULL_PERMISSIONS: Permissions = Object.fromEntries(
  Object.entries(PERMISSION_RESOURCES).map(([k, v]) => [k, [...v]])
);
