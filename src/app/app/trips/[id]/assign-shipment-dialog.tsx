"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link2 } from "lucide-react";
import { assignShipmentAction } from "../actions";

type Shipment = { id: string; shipmentNumber: string; totalCartons: number; customer: { name: string } };

export function AssignShipmentDialog({ tripId, shipments }: { tripId: string; shipments: Shipment[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      for (const id of selected) {
        const result = await assignShipmentAction(tripId, id);
        if (result && "error" in result && result.error) {
          toast.error(`${id}: ${result.error}`);
        }
      }
      setSelected([]);
      setOpen(false);
      router.refresh();
      toast.success("تم ربط الشحنات بالرحلة");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Link2 className="h-3.5 w-3.5" /> ربط شحنة</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>ربط شحنات بهذه المحطة</DialogTitle></DialogHeader>
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
          {shipments.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">لا توجد شحنات جاهزة للربط من هذا الفرع</p>}
        </div>
        <DialogFooter>
          <Button disabled={pending || selected.length === 0} onClick={submit}>
            {pending ? "جارٍ الربط..." : `ربط (${selected.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
