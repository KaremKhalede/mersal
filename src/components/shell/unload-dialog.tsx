"use client";

import { useState } from "react";
import { FormDialog } from "@/components/shell/form-dialog";
import { AlertTriangle } from "lucide-react";

export type UnloadShipment = {
  shipmentNumber: string;
  destination: string;
  cartons: { id: string; cartonIndex: number; cartonCode: string }[];
};

/**
 * Confirming an unload, carton by carton — but only for the cartons that are *not* there.
 *
 * Everything starts as arrived, because that is what almost every unload is: the employee taps only
 * the boxes missing from the pile in front of them. Making them confirm 45 cartons one at a time to
 * record the usual "all fine" would guarantee the screen gets clicked through blind, which is worse
 * evidence than the count it replaced.
 *
 * The selection is submitted as repeated `missingCartonIds` inputs, so the server receives
 * identities and never a number it has to guess identities back out of.
 */
export function UnloadDialog({
  trigger,
  shipments,
  action,
}: {
  trigger: React.ReactNode;
  shipments: UnloadShipment[];
  // Same shape FormDialog accepts: hardened actions return their result *or* an { error }, and
  // both have to fit through here unchanged.
  action: (formData: FormData) => Promise<{ error?: string; [key: string]: unknown } | void>;
}) {
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const totalCartons = shipments.reduce((sum, s) => sum + s.cartons.length, 0);
  const missingCount = missing.size;
  const arrivedCount = totalCartons - missingCount;

  function toggle(id: string) {
    setMissing((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <FormDialog
      trigger={trigger}
      title="تأكيد التفريغ"
      description="كل الكراتين تُعتبر واصلة — حدد الناقص فقط."
      submitLabel="تأكيد التفريغ"
      action={action}
    >
      {[...missing].map((id) => (
        <input key={id} type="hidden" name="missingCartonIds" value={id} />
      ))}

      {/* Running totals, not a final tally: the employee is looking at a pile and needs the numbers
          to agree with it before committing, not after. */}
      <div data-testid="unload-summary" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3 text-sm">
        <span className="font-semibold">{totalCartons} كرتون</span>
        <span className="text-success">{arrivedCount} وصلت</span>
        <span className={missingCount > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}>{missingCount} مفقود</span>
      </div>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto">
        {shipments.map((shipment) => (
          <div key={shipment.shipmentNumber} data-testid={`unload-shipment-${shipment.shipmentNumber}`} className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="whitespace-nowrap font-semibold" dir="ltr">{shipment.shipmentNumber}</span>
              <span className="text-sm text-muted-foreground">إلى {shipment.destination}</span>
            </div>
            {/* Fixed columns rather than flex-wrap so C1..Cn stay a readable grid at 390px, and each
                cell stays a real tap target instead of shrinking to fit a long code. */}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {shipment.cartons.map((carton) => {
                const isMissing = missing.has(carton.id);
                return (
                  <button
                    key={carton.id}
                    type="button"
                    data-testid={`carton-${carton.cartonCode}`}
                    aria-pressed={isMissing}
                    onClick={() => toggle(carton.id)}
                    className={`h-11 rounded-lg border text-sm font-medium transition-colors ${
                      isMissing
                        ? "border-destructive bg-destructive/10 text-destructive line-through"
                        : "border-success/40 bg-success/10 text-success"
                    }`}
                  >
                    C{carton.cartonIndex}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Nothing blocks the confirm — a missing carton is a real thing that has to be recordable —
          but it may not slip through unnoticed either. */}
      {missingCount > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          سيتم تسجيل {missingCount} كرتون كمفقود، وستُعلَّم الشحنة بوصول جزئي.
        </p>
      )}
    </FormDialog>
  );
}
