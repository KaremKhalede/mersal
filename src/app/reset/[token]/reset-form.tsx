"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeResetAction, type ResetState } from "./actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { CheckCircle2 } from "lucide-react";

export function ResetForm({ token, name }: { token: string; name: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(completeResetAction, {});

  if (state.success) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <p className="font-medium">تم تعيين كلمة المرور</p>
        <Button asChild className="w-full">
          <Link href="/login">تسجيل الدخول</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">
        مرحباً {name} — اختر كلمة مرور جديدة لحسابك.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="password">كلمة المرور الجديدة</Label>
        <Input id="password" name="password" type="password" required dir="ltr" minLength={MIN_PASSWORD_LENGTH} />
        <p className="text-xs text-muted-foreground">{MIN_PASSWORD_LENGTH} أحرف على الأقل</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="passwordConfirm">تأكيد كلمة المرور</Label>
        <Input id="passwordConfirm" name="passwordConfirm" type="password" required dir="ltr" minLength={MIN_PASSWORD_LENGTH} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "جارٍ الحفظ..." : "تعيين كلمة المرور"}
      </Button>
    </form>
  );
}
