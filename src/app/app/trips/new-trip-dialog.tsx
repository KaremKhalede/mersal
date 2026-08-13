"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { createTripAction } from "./actions";

type Branch = { id: string; name: string };
type Driver = { id: string; name: string };

export function NewTripDialog({ branches, drivers }: { branches: Branch[]; drivers: Driver[] }) {
  const [open, setOpen] = useState(false);
  const [stops, setStops] = useState<{ branchId: string; loading: boolean; unloading: boolean }[]>([
    { branchId: "", loading: true, unloading: false },
    { branchId: "", loading: false, unloading: true },
  ]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createTripAction(formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("تم إنشاء الرحلة");
      setOpen(false);
      if (result && "tripId" in result) router.push(`/app/trips/${result.tripId}`);
      else router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> رحلة جديدة</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>إنشاء رحلة جديدة</DialogTitle></DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vehiclePlate">رقم المركبة</Label>
              <Input id="vehiclePlate" name="vehiclePlate" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>السائق</Label>
              <Select name="driverId">
                <SelectTrigger><SelectValue placeholder="اختر السائق" /></SelectTrigger>
                <SelectContent>
                  {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>محطات الرحلة (بالترتيب)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setStops((s) => [...s, { branchId: "", loading: false, unloading: false }])}>
                <Plus className="h-3.5 w-3.5" /> إضافة محطة
              </Button>
            </div>
            <div className="space-y-2">
              {stops.map((stop, i) => (
                <div key={i} data-testid={`new-trip-stop-${i}`} className="flex items-center gap-2 rounded-lg border p-2 flex-wrap">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <Select name="stopBranchId" defaultValue={stop.branchId} required>
                    <SelectTrigger className="flex-1 min-w-32"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                    <SelectContent>
                      {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-1 text-xs shrink-0">
                    <Checkbox name="stopLoading" value={String(i)} defaultChecked={stop.loading} /> تحميل
                  </label>
                  <label className="flex items-center gap-1 text-xs shrink-0">
                    <Checkbox name="stopUnloading" value={String(i)} defaultChecked={stop.unloading} /> تفريغ
                  </label>
                  <Input
                    type="datetime-local"
                    name="stopPlannedArrival"
                    aria-label="الوصول المتوقع"
                    title="الوصول المتوقع (اختياري)"
                    className="h-8 w-40 text-xs shrink-0"
                  />
                  {stops.length > 2 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setStops((s) => s.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "جارٍ الإنشاء..." : "إنشاء الرحلة"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
