"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/shell/form-dialog";
import { PackageSearch } from "lucide-react";
import { confirmLateCartonsAction } from "../actions";

/**
 * The one thing an office can do about a carton that was short at handover and has since arrived:
 * say so.
 *
 * Same chip pattern as the unload dialog, inverted — here everything starts *not* selected, because
 * the normal case is one specific box turning up, not all of them at once. Missing cartons can
 * arrive on different trips weeks apart, so this is per-carton by design.
 *
 * It deliberately cannot reopen the shipment: the handover already happened and its proof stands.
 */
export function LateCartonDialog({
  shipmentId,
  missingCartons,
}: {
  shipmentId: string;
  missingCartons: { id: string; cartonIndex: number; cartonCode: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <FormDialog
      trigger={
        <Button size="sm">
          <PackageSearch className="h-4 w-4" /> وصل كرتون متأخر
        </Button>
      }
      title="تسجيل وصول كرتون متأخر"
      description="حدد الكرتون الذي وصل بعد تسليم الشحنة. لن يتغيّر تسليم الشحنة ولا إثباته."
      submitLabel="تسجيل الوصول"
      action={(formData) => confirmLateCartonsAction(shipmentId, formData)}
    >
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="cartonIds" value={id} />
      ))}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {missingCartons.map((carton) => {
          const isSelected = selected.has(carton.id);
          return (
            <button
              key={carton.id}
              type="button"
              data-testid={`late-carton-${carton.cartonCode}`}
              aria-pressed={isSelected}
              onClick={() => toggle(carton.id)}
              className={`h-11 rounded-lg border text-sm font-medium transition-colors ${
                isSelected ? "border-success bg-success/10 text-success" : "border-destructive/40 bg-destructive/5 text-destructive"
              }`}
            >
              C{carton.cartonIndex}
            </button>
          );
        })}
      </div>
    </FormDialog>
  );
}
