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
  supportPhone,
  supportWhatsapp,
  supportEmail,
  supportHours,
  canManage,
}: {
  name: string;
  feePerCartonYER: number;
  whatsappSenderName: string;
  supportPhone: string | null;
  supportWhatsapp: string | null;
  supportEmail: string | null;
  supportHours: string | null;
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

      {/*
        Support contact for the PUBLIC tracking page (/track) — the one screen in this product read
        by people with no account. A customer who cannot find their shipment there has no other
        route: they do not know which carrier holds it, so they cannot call a branch, and they have
        no login. Leave these empty and the page shows no contact band at all, which is the honest
        state — it will never print a number nobody answers.
      */}
      <div className="space-y-4 rounded-xl border p-4">
        <div>
          <p className="text-sm font-semibold">دعم صفحة التتبع العامة</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تظهر للعميل على صفحة تتبع الشحنة. اتركها فارغة ولن يظهر قسم التواصل إطلاقاً.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supportPhone">رقم الدعم</Label>
            <Input id="supportPhone" name="supportPhone" dir="ltr" defaultValue={supportPhone ?? ""} placeholder="+967 77 123 4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supportWhatsapp">واتساب الدعم</Label>
            <Input id="supportWhatsapp" name="supportWhatsapp" dir="ltr" defaultValue={supportWhatsapp ?? ""} placeholder="+967 77 123 4567" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supportEmail">بريد الدعم</Label>
            <Input id="supportEmail" name="supportEmail" type="email" dir="ltr" defaultValue={supportEmail ?? ""} placeholder="support@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="supportHours">أوقات العمل</Label>
            <Input id="supportHours" name="supportHours" defaultValue={supportHours ?? ""} placeholder="من 8 ص إلى 10 م" />
          </div>
        </div>
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
