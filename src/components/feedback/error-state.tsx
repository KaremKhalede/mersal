"use client";

import { useEffect } from "react";
import { RotateCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StateShell, BackButton } from "./state-shell";

/**
 * Shared body for every `error.tsx` in the app.
 *
 * Two things it deliberately does NOT do:
 *   - Show `error.message`. In production Next.js has already replaced it with a digest, and in
 *     development it is a stack-bearing internal string. Neither belongs in front of a shipping
 *     clerk.
 *   - Blame the user. A failed render is our problem; the copy says what happened and offers the
 *     one action that usually fixes it.
 *
 * `retry()` (not `reset()`) is the prop this version of Next passes to error boundaries: it
 * re-fetches and re-renders the segment, so it can actually recover from a failed Server Component
 * render. `reset()` only clears the boundary and would loop straight back into the same error.
 */
export function ErrorState({
  error,
  retry,
  title = "تعذّر تحميل الصفحة",
  description = "حدث خطأ غير متوقع أثناء تحميل هذه الصفحة. قد تكون المشكلة مؤقتة — حاول مرة أخرى.",
  backHref,
  backLabel,
  compact,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  compact?: boolean;
}) {
  useEffect(() => {
    // Full detail stays server-side/in the console; the screen above shows none of it.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <StateShell icon={AlertTriangle} tone="destructive" title={title} description={description} compact={compact}>
      <Button onClick={() => retry()}>
        <RotateCw className="h-4 w-4" />
        حاول مرة أخرى
      </Button>
      {backHref && backLabel && <BackButton href={backHref} label={backLabel} />}
      {/* Not a stack trace and not an explanation — a short reference an employee can read out to
          support, which is the only way a redacted production error is ever diagnosable. */}
      {error.digest && (
        <p className="w-full pt-1 text-[11px] text-muted-foreground" dir="ltr">
          {error.digest}
        </p>
      )}
    </StateShell>
  );
}
