"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sparkles } from "lucide-react";
import { assignShipmentAction } from "../actions";

type Shipment = { id: string; shipmentNumber: string; totalCartons: number; customer: { name: string } };

/**
 * Suggests every shipment that already matches this stop's route and load status (the exact same
 * eligibility rule autoAssignShipmentToTrip enforces server-side — see getUnassignedShipmentsForStop)
 * with a one-click "select all" so the default action is "confirm the whole suggested batch," not
 * "hunt through a list and pick one by one." Individual checkboxes stay opt-in (unchecked) until
 * that's pressed — staff can also still hand-pick one or two without touching it at all.
 */
export function AssignShipmentDialog({ tripId, shipments }: { tripId: string; shipments: Shipment[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const totalCartons = shipments.reduce((sum, s) => sum + s.totalCartons, 0);
  const allSelected = selected.length === shipments.length && shipments.length > 0;

  function submit() {
    startTransition(async () => {
      for (const id of selected) {
        const result = await assignShipmentAction(tripId, id);
        if (result && "error" in result && result.error) {
          toast.error(`${id}: ${result.error}`);
        }
      }
      setOpen(false);
      router.refresh();
      toast.success("تم ربط الشحنات بالرحلة");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected([]); // reset on reopen — an earlier confirmed batch shouldn't linger
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={shipments.length > 0 ? "default" : "outline"}>
          <Sparkles className="h-3.5 w-3.5" /> اقتراح الشحنات {shipments.length > 0 && `(${shipments.length})`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>الشحنات المقترحة لهذه المحطة</DialogTitle>
          {shipments.length > 0 && (
            <DialogDescription>
              {shipments.length} شحنة مطابقة لهذا المسار — {totalCartons} كرتون. اختر «تحديد الكل» لإضافتها جميعاً دفعة واحدة، أو حدّد ما تريده منها فقط.
            </DialogDescription>
          )}
        </DialogHeader>

        {shipments.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(allSelected ? [] : shipments.map((s) => s.id))}
            className="w-fit text-xs text-primary hover:underline"
          >
            {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
          </button>
        )}

        <div className="max-h-80 overflow-y-auto space-y-1">
          {shipments.map((s) => (
            <label key={s.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm cursor-pointer hover:bg-accent">
              <Checkbox
                checked={selected.includes(s.id)}
                onCheckedChange={(v) => setSelected((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
              />
              <span className="font-medium">{s.shipmentNumber}</span>
              <span className="text-muted-foreground">{s.customer.name}</span>
              <span className="ms-auto text-muted-foreground">{s.totalCartons} كرتون</span>
            </label>
          ))}
          {shipments.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">لا توجد شحنات مطابقة لهذا المسار حالياً</p>}
        </div>
        <DialogFooter>
          <Button disabled={pending || selected.length === 0} onClick={submit}>
            {pending ? "جارٍ الإضافة..." : `إضافة (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
