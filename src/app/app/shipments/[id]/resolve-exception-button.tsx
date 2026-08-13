"use client";

import { ActionButton } from "@/components/shell/action-button";
import { CheckCircle2, XCircle } from "lucide-react";
import { resolveExceptionAction } from "../actions";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";

export function ResolveExceptionButton({ shipmentId, statusBeforeException }: { shipmentId: string; statusBeforeException: string | null }) {
  const prevLabel = statusBeforeException ? SHIPMENT_STATUS_LABELS[statusBeforeException as ShipmentStatus] : "الحالة السابقة";

  return (
    <div className="flex gap-2">
      <ActionButton
        icon={CheckCircle2}
        action={() => resolveExceptionAction(shipmentId)}
        confirmMessage={`إعادة الشحنة إلى حالة "${prevLabel}"؟`}
        successMessage="تم حل الاستثناء"
      >
        حل الاستثناء (إعادة إلى {prevLabel})
      </ActionButton>
      <ActionButton
        icon={XCircle}
        variant="destructive"
        action={() => resolveExceptionAction(shipmentId, "CANCELLED")}
        confirmMessage="إلغاء الشحنة نهائياً؟"
        successMessage="تم إلغاء الشحنة"
      >
        إلغاء الشحنة
      </ActionButton>
    </div>
  );
}
