"use client";

import { ActionButton } from "@/components/shell/action-button";
import { CheckCircle2, XCircle } from "lucide-react";
import { resolveExceptionAction } from "../actions";

export type RecoveryOption = { status: string; label: string; isPrimary: boolean };

/**
 * Resolving an exception, as a set of things an employee can *do* — never as a list of statuses.
 *
 * The old version offered exactly one recovery ("go back to where it was") plus cancel, and for a
 * shipment that had arrived short, or was out for delivery, that single button threw an invalid
 * transition error. The employee's only working option was cancelling a shipment whose cartons were
 * physically sitting in the destination branch.
 *
 * The options come from the server (getExceptionRecoveryOptions), which derives them from the
 * status recorded when the exception was raised, and resolveException re-validates the choice — so
 * a button can never offer a move the server will refuse, and a crafted request can never take one
 * that was not offered.
 */
export function ResolveExceptionButton({ shipmentId, options }: { shipmentId: string; options: RecoveryOption[] }) {
  const recoveries = options.filter((o) => o.status !== "CANCELLED");
  const cancel = options.find((o) => o.status === "CANCELLED");

  return (
    <div className="flex flex-wrap gap-2">
      {recoveries.map((option) => (
        <ActionButton
          key={option.status}
          icon={CheckCircle2}
          variant={option.isPrimary ? "default" : "outline"}
          action={() => resolveExceptionAction(shipmentId, option.status as never)}
          confirmMessage={`${option.label}؟`}
          successMessage="تم حل الاستثناء"
        >
          {option.label}
        </ActionButton>
      ))}
      {cancel && (
        <ActionButton
          icon={XCircle}
          variant="destructive"
          action={() => resolveExceptionAction(shipmentId, "CANCELLED")}
          confirmMessage="إلغاء الشحنة نهائياً؟"
          successMessage="تم إلغاء الشحنة"
        >
          إلغاء الشحنة
        </ActionButton>
      )}
    </div>
  );
}
