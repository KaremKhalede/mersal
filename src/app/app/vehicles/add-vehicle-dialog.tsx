"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus } from "lucide-react";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/enums";
import { createVehicleAction } from "./actions";

export function AddVehicleDialog() {
  return (
    <FormDialog
      trigger={<Button><Plus className="h-4 w-4" /> مركبة جديدة</Button>}
      title="إضافة مركبة جديدة"
      action={createVehicleAction}
      submitLabel="حفظ المركبة"
    >
      <div className="space-y-1.5">
        <Label htmlFor="plateNumber">رقم اللوحة *</Label>
        <Input id="plateNumber" name="plateNumber" dir="ltr" required />
      </div>
      <div className="space-y-1.5">
        <Label>نوع المركبة *</Label>
        <Select name="type" required>
          <SelectTrigger className="w-full"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
          <SelectContent>
            {VEHICLE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">ملاحظات (اختياري)</Label>
        <Textarea id="notes" name="notes" rows={2} />
      </div>
    </FormDialog>
  );
}
