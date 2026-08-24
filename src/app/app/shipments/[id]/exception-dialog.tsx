"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shell/form-dialog";
import { AlertTriangle } from "lucide-react";
import { raiseExceptionAction } from "../actions";
import { EXCEPTION_TYPES, EXCEPTION_TYPE_LABELS } from "@/lib/enums";

export function ExceptionDialog({ shipmentId, open, onOpenChange }: { shipmentId: string; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={open === undefined ? <Button size="sm" variant="destructive"><AlertTriangle className="h-4 w-4" /> تسجيل استثناء</Button> : undefined}
      title="تسجيل استثناء"
      description="سيتم نقل الشحنة إلى حالة استثناء ويمكن إعادتها لاحقاً من صفحة الاستثناءات."
      action={raiseExceptionAction}
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <div className="space-y-1.5">
        <Label>نوع المشكلة</Label>
        <Select name="exceptionType" defaultValue="OTHER">
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EXCEPTION_TYPES.map((t) => <SelectItem key={t} value={t}>{EXCEPTION_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">تفاصيل (اختياري)</Label>
        <Textarea id="note" name="note" rows={3} />
      </div>
    </FormDialog>
  );
}
