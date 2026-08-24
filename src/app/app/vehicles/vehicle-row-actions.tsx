"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormDialog } from "@/components/shell/form-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from "@/lib/enums";
import { updateVehicleAction, toggleVehicleActiveAction } from "./actions";

type Vehicle = { id: string; plateNumber: string; type: string | null; notes: string | null; isActive: boolean };

export function VehicleRowActions({ vehicle, canEdit, canDisable }: { vehicle: Vehicle; canEdit: boolean; canDisable: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleStatus(nextActive: boolean) {
    startTransition(async () => {
      try {
        await toggleVehicleActiveAction(vehicle.id, nextActive);
        router.refresh();
        toast.success(nextActive ? "تم تفعيل المركبة" : "تم تعطيل المركبة");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/app/vehicles/${vehicle.id}`}><Eye className="h-4 w-4" /> عرض التفاصيل</Link>
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> تعديل
            </DropdownMenuItem>
          )}
          {canDisable && (
            <DropdownMenuItem
              variant={vehicle.isActive ? "destructive" : "default"}
              onSelect={() => (vehicle.isActive ? setConfirmDisableOpen(true) : toggleStatus(true))}
              disabled={pending}
            >
              {vehicle.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {vehicle.isActive ? "تعطيل" : "تفعيل"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Stays a plain Dialog: a yes/no confirmation, not a form — there is no input to preserve. */}
      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعطيل المركبة؟</DialogTitle>
            <DialogDescription>لن تظهر المركبة كمركبة متاحة عند إنشاء رحلات جديدة، وستبقى الرحلات السابقة محفوظة.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDisableOpen(false)}>إلغاء</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmDisableOpen(false);
                toggleStatus(false);
              }}
            >
              تعطيل المركبة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Controlled: opened from a menu item, so the dialog cannot own a nested trigger. */}
      {canEdit && (
        <FormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title="تعديل المركبة"
          successMessage="تم حفظ التعديلات"
          action={(formData) => updateVehicleAction(vehicle.id, formData)}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`plateNumber-${vehicle.id}`}>رقم اللوحة</Label>
            <Input id={`plateNumber-${vehicle.id}`} name="plateNumber" dir="ltr" defaultValue={vehicle.plateNumber} required />
          </div>
          <div className="space-y-1.5">
            <Label>نوع المركبة</Label>
            <Select name="type" defaultValue={vehicle.type ?? undefined}>
              <SelectTrigger className="w-full"><SelectValue placeholder="اختر النوع" /></SelectTrigger>
              <SelectContent>
                {VEHICLE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`notes-${vehicle.id}`}>ملاحظات (اختياري)</Label>
            <Textarea id={`notes-${vehicle.id}`} name="notes" rows={2} defaultValue={vehicle.notes ?? ""} />
          </div>
        </FormDialog>
      )}
    </>
  );
}
