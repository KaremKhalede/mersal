"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePlatformSettingsAction, type SettingsState } from "./actions";

/**
 * Client boundary for the platform settings form. Exists so the action's result is rendered at all:
 * a Server Component's `<form action={...}>` throws the return value away, which meant a rejected
 * save (bad fee, missing permission) looked exactly like a successful one.
 */
export function PlatformSettingsForm({
  name,
  feePerCartonYER,
  whatsappSenderName,
  canManage,
}: {
  name: string;
  feePerCartonYER: number;
  whatsappSenderName: string;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(updatePlatformSettingsAction, {});

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">اسم المنصة</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="feePerCartonYER">رسوم المنصة لكل كرتون (ريال يمني)</Label>
        <Input
          id="feePerCartonYER"
          name="feePerCartonYER"
          type="number"
          step="0.5"
          min="0"
          defaultValue={feePerCartonYER}
          required
        />
        <p className="text-xs text-muted-foreground">
          يُطبَّق على الشحنات الجديدة فقط — الفواتير الصادرة تحتفظ بالسعر الذي حُسبت به.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsappSenderName">اسم المرسل في واتساب</Label>
        <Input id="whatsappSenderName" name="whatsappSenderName" defaultValue={whatsappSenderName} />
      </div>

      {state.error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={!canManage || pending}>
        {pending ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </form>
  );
}
