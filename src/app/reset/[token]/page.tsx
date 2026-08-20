import Link from "next/link";
import { Package } from "lucide-react";
import { resolvePasswordReset } from "@/modules/users/password-reset";
import { Button } from "@/components/ui/button";
import { ResetForm } from "./reset-form";

/**
 * Public page behind an admin-issued reset link.
 *
 * An invalid, expired or already-used token renders the same plain "طلب رابط جديد" panel as a
 * forged one — no hint that some other token would have worked, and no way to tell an existing
 * account from a non-existent one. Same reasoning as the tracking page's 404.
 */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolvePasswordReset(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4" dir="rtl">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-6">
        <div className="space-y-1 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold">تعيين كلمة مرور جديدة</h1>
        </div>

        {target ? (
          <ResetForm token={token} name={target.name} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              هذا الرابط غير صالح أو انتهت صلاحيته. تواصل مع مسؤول حسابك لإصدار رابط جديد.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">العودة لتسجيل الدخول</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
