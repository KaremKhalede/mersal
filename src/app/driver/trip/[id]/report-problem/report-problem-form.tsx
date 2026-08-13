"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reportProblemAction } from "../../../actions";

const PROBLEM_TYPES = [
  { value: "MISSING_CARTON", label: "كرتون ناقص" },
  { value: "DAMAGED", label: "شحنة تالفة" },
  { value: "NOT_LOADED", label: "شحنة لم تُحمّل" },
  { value: "OTHER", label: "أخرى" },
];

type Shipment = { id: string; shipmentNumber: string; totalCartons: number };

export function ReportProblemForm({ tripId, shipments }: { tripId: string; shipments: Shipment[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [shipmentId, setShipmentId] = useState("");
  const [problemType, setProblemType] = useState("MISSING_CARTON");

  const selected = shipments.find((s) => s.id === shipmentId);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await reportProblemAction(formData);
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
        <label className="text-sm font-medium">الشحنة</label>
        <Select name="shipmentId" required value={shipmentId} onValueChange={setShipmentId}>
          <SelectTrigger className="h-12"><SelectValue placeholder="اختر الشحنة" /></SelectTrigger>
          <SelectContent>
            {shipments.map((s) => <SelectItem key={s.id} value={s.id}>{s.shipmentNumber} ({s.totalCartons} كرتون)</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">نوع المشكلة</label>
        <Select name="problemType" value={problemType} onValueChange={setProblemType}>
          <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PROBLEM_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {problemType === "MISSING_CARTON" && selected && (
        <div className="space-y-1.5">
          <Label htmlFor="arrivedCartons">عدد الكراتين الواصلة فعلياً (من أصل {selected.totalCartons})</Label>
          <Input
            id="arrivedCartons"
            name="arrivedCartons"
            type="number"
            min={0}
            max={selected.totalCartons}
            defaultValue={Math.max(0, selected.totalCartons - 1)}
            className="h-12"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">تفاصيل المشكلة (اختياري)</label>
        <Textarea name="note" rows={3} />
      </div>
      <Button type="submit" variant="destructive" className="w-full h-12 text-base" disabled={pending}>
        {pending ? "جارٍ الإرسال..." : "إرسال البلاغ"}
      </Button>
    </form>
  );
}
