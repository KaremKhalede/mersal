"use client";

import { useEffect } from "react";
import { AlertTriangle, Package, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Customer-facing error on the public tracking page.
 *
 * Separate from the shared ErrorState because this audience is different: no "back to dashboard"
 * (there is nowhere to go back to), no reference code (a customer cannot file a support ticket with
 * it), and wording that assumes a phone on a weak connection rather than a broken application.
 */
export default function TrackError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("[track-error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-5 py-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-lg font-bold">تعذّر عرض حالة الشحنة</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            قد يكون الاتصال ضعيفاً. تحقق من الإنترنت ثم حاول مرة أخرى.
          </p>
          <Button className="mt-6 h-11 w-full" onClick={() => retry()}>
            <RotateCw className="h-4 w-4" />
            حاول مرة أخرى
          </Button>
        </div>
      </div>
    </div>
  );
}
