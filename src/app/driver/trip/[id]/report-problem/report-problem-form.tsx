"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportProblemAction } from "../../../actions";

const PROBLEM_TYPES = [
  { value: "MISSING_CARTON", label: "كرتون ناقص" },
  { value: "DAMAGED", label: "شحنة تالفة" },
  { value: "NOT_LOADED", label: "شحنة لم تُحمّل" },
  { value: "OTHER", label: "أخرى" },
];

type Shipment = { id: string; shipmentNumber: string; totalCartons: number; cartons: { id: string; cartonIndex: number; cartonCode: string }[] };

export function ReportProblemForm({ tripId, shipments }: { tripId: string; shipments: Shipment[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [shipmentId, setShipmentId] = useState("");
  const [problemType, setProblemType] = useState("MISSING_CARTON");
  const [missing, setMissing] = useState<Set<string>>(new Set());

  const selected = shipments.find((s) => s.id === shipmentId);

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

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>الشحنة</Label>
        <Select name="shipmentId" required value={shipmentId} onValueChange={setShipmentId}>
          <SelectTrigger className="h-12"><SelectValue placeholder="اختر الشحنة" /></SelectTrigger>
          <SelectContent>
            {shipments.map((s) => <SelectItem key={s.id} value={s.id}>{s.shipmentNumber} ({s.totalCartons} كرتون)</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>نوع المشكلة</Label>
        <Select name="problemType" value={problemType} onValueChange={setProblemType}>
          <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROBLEM_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
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
