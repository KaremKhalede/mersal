"use client";

import { useState } from "react";
import { FormDialog } from "@/components/shell/form-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRoundCog } from "lucide-react";
import { assignTripCrewAction } from "../actions";

export type CrewOption = { id: string; label: string; /** Trip number this one is already on, if any. */ busyOn?: string };

/**
 * Who drives this trip, and in what — the decision the product could not record after the trip was
 * created (see assignTripCrew).
 *
 * Both fields carry a "no one yet" option on purpose. A trip planned the night before genuinely has
 * no crew, and forcing a name into the field to save the form is how a dispatcher ends up assigning
 * whoever is first in the list — a wrong answer that looks like a real one on the driver's phone.
 *
 * A person already committed to another live trip is labelled, not hidden and not blocked. One
 * driver taking two runs in a day is normal dispatch; silently double-booking one is not. Stating
 * it lets the office decide, and hiding the option would just send them to a spreadsheet.
 */
export function AssignCrewDialog({
  tripId,
  drivers,
  vehicles,
  currentDriverId,
  currentVehicleId,
}: {
  tripId: string;
  drivers: CrewOption[];
  vehicles: CrewOption[];
  currentDriverId: string | null;
  currentVehicleId: string | null;
}) {
  const NONE = "__none__";
  const [driverId, setDriverId] = useState(currentDriverId ?? NONE);
  const [vehicleId, setVehicleId] = useState(currentVehicleId ?? NONE);

  const assigned = Boolean(currentDriverId);
  const busyDriver = drivers.find((d) => d.id === driverId)?.busyOn;
  const busyVehicle = vehicles.find((v) => v.id === vehicleId)?.busyOn;

  return (
    <FormDialog
      trigger={
        <Button size="sm" variant={assigned ? "outline" : "default"}>
          <UserRoundCog className="h-4 w-4" /> {assigned ? "تغيير الطاقم" : "تعيين سائق"}
        </Button>
      }
      title="طاقم الرحلة"
      description="السائق والمركبة المسؤولان عن تنفيذ هذه الرحلة."
      submitLabel="حفظ الطاقم"
      successMessage="تم تحديث طاقم الرحلة"
      action={(formData) => assignTripCrewAction(tripId, formData)}
    >
      {/* Hidden inputs rather than name= on the Select: Radix renders its own aria-hidden native
          proxy, and an empty proxy is not the same as a submitted empty string — the trap the trip
          wizard's own comment documents. Sending "" explicitly is what clears an assignment. */}
      <input type="hidden" name="driverId" value={driverId === NONE ? "" : driverId} />
      <input type="hidden" name="vehicleId" value={vehicleId === NONE ? "" : vehicleId} />

      <div className="space-y-1.5">
        <Label>السائق</Label>
        <Select value={driverId} onValueChange={setDriverId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="اختر السائق" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>بدون سائق</SelectItem>
            {drivers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.label}{d.busyOn ? ` — على ${d.busyOn}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {busyDriver && (
          <p className="text-xs text-warning">هذا السائق مرتبط برحلة {busyDriver} التي لم تنتهِ بعد.</p>
        )}
        {drivers.length === 0 && (
          <p className="text-xs text-muted-foreground">لا يوجد سائقون مفعّلون — أضف سائقاً من صفحة الموظفين.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>المركبة</Label>
        <Select value={vehicleId} onValueChange={setVehicleId}>
          <SelectTrigger className="w-full"><SelectValue placeholder="اختر المركبة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>بدون مركبة</SelectItem>
            {vehicles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                <span dir="ltr">{v.label}</span>{v.busyOn ? ` — على ${v.busyOn}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {busyVehicle && (
          <p className="text-xs text-warning">هذه المركبة مرتبطة برحلة {busyVehicle} التي لم تنتهِ بعد.</p>
        )}
      </div>
    </FormDialog>
  );
}
