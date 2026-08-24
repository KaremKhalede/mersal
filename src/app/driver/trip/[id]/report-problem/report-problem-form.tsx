"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportProblemAction } from "../../../actions";

/**
 * What can be wrong, and when.
 *
 * `onlyWhen` is not tidiness — it is the difference between a menu that means something and one
 * that offers the driver a lie. "كرتون ناقص" counts cartons that came off a truck, so it needs a
 * shipment that was loaded; "شحنة لم تُحمّل" is only true of one that was not. Offering both for
 * every shipment is how the second one ended up unreportable for months: the list it was shown next
 * to contained only loaded shipments.
 */
const PROBLEM_TYPES = [
  { value: "MISSING_CARTON", label: "كرتون ناقص", onlyWhen: "loaded" },
  { value: "NOT_LOADED", label: "شحنة لم تُحمّل", onlyWhen: "not-loaded" },
  { value: "DAMAGED", label: "شحنة تالفة", onlyWhen: "any" },
  { value: "OTHER", label: "أخرى", onlyWhen: "any" },
] as const;

type Shipment = {
  id: string;
  shipmentNumber: string;
  totalCartons: number;
  cartons: { id: string; cartonIndex: number; cartonCode: string }[];
  /** Whether this shipment is physically on the truck (its link has a loadedAt). */
  loaded: boolean;
};

export function ReportProblemForm({ tripId, shipments }: { tripId: string; shipments: Shipment[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [shipmentId, setShipmentId] = useState("");
  const [problemType, setProblemType] = useState("");
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const selected = shipments.find((s) => s.id === shipmentId);
  const types = PROBLEM_TYPES.filter(
    (t) => t.onlyWhen === "any" || !selected || (t.onlyWhen === "loaded") === selected.loaded
  );

  /** Picking a shipment decides which problems are possible, so the type resets with it rather than
   *  carrying a choice that no longer applies to what is being reported. */
  function pickShipment(id: string) {
    setShipmentId(id);
    setMissing(new Set());
    const next = shipments.find((s) => s.id === id);
    setProblemType(next?.loaded ? "MISSING_CARTON" : "NOT_LOADED");
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        const r = await reportProblemAction(formData);
        if (r?.error) { toast.error(r.error); return; }
        toast.success("تم إرسال البلاغ");
        router.push(`/driver/trip/${tripId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر إرسال البلاغ");
      }
    });
  }

  // onSubmit, not <form action={...}> — the same trap FormDialog documents: React resets an
  // uncontrolled form once a form action settles, *including when it failed*, so a rejected report
  // came back with the note blank and the driver retyping it on a phone at a stop. The
  // stops/vehicle/driver fields elsewhere in the app survive this only because they are controlled
  // by state; `note` is not. Unreachable until now — the Select's `required` blocked the submit
  // before the action ever ran.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }}
      className="space-y-4"
    >
      <div className="space-y-1.5">
        <Label required>الشحنة</Label>
        <Select name="shipmentId" value={shipmentId} onValueChange={pickShipment}>
          <SelectTrigger className="h-12"><SelectValue placeholder="اختر الشحنة" /></SelectTrigger>
          <SelectContent>
            {shipments.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.shipmentNumber} ({s.totalCartons} كرتون){s.loaded ? "" : " — لم تُحمّل بعد"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>نوع المشكلة</Label>
        <Select name="problemType" value={problemType} onValueChange={setProblemType} disabled={!selected}>
          <SelectTrigger className="h-12"><SelectValue placeholder="اختر الشحنة أولاً" /></SelectTrigger>
          <SelectContent>
            {types.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {/* Which cartons, not how many. A count made the server pick the missing ones by index, so a
          driver reporting "one short" always blamed the last carton — see reportPartialArrival. */}
      {problemType === "MISSING_CARTON" && selected && (
        <div className="space-y-1.5">
          <Label>الكراتين المفقودة (من أصل {selected.totalCartons})</Label>
          {[...missing].map((id) => (
            <input key={id} type="hidden" name="missingCartonIds" value={id} />
          ))}
          <div className="grid grid-cols-4 gap-2">
            {selected.cartons.map((carton) => {
              const isMissing = missing.has(carton.id);
              return (
                <button
                  key={carton.id}
                  type="button"
                  data-testid={`report-carton-${carton.cartonCode}`}
                  aria-pressed={isMissing}
                  onClick={() =>
                    setMissing((prev) => {
                      const next = new Set(prev);
                      if (next.has(carton.id)) next.delete(carton.id);
                      else next.add(carton.id);
                      return next;
                    })
                  }
                  className={`h-12 rounded-lg border text-base font-medium ${
                    isMissing ? "border-destructive bg-destructive/10 text-destructive line-through" : "border-input"
                  }`}
                >
                  C{carton.cartonIndex}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>تفاصيل المشكلة (اختياري)</Label>
        <Textarea name="note" rows={3} />
      </div>
      <Button type="submit" variant="destructive" className="w-full h-12 text-base" disabled={pending}>
        {pending ? "جارٍ الإرسال..." : "إرسال البلاغ"}
      </Button>
    </form>
  );
}
