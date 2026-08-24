"use client";

import { ErrorState } from "@/components/feedback/error-state";

/**
 * The boundary for the routes that sit outside the four app segments — the landing page, login and
 * the password-reset link.
 *
 * `error.tsx` is a *segment* boundary: it catches every render below it, so `/app`, `/platform`,
 * `/driver` and `/track` have been fully covered all along by one file each. These three routes
 * were the gap, and a failure in them fell through to `global-error.tsx`, which replaces the entire
 * document — the harshest recovery screen in the product, shown to someone who is not even signed
 * in yet and has no idea what went wrong.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      error={error}
      retry={retry}
      description="حدث خطأ أثناء تحميل هذه الصفحة. حاول مرة أخرى، وإذا تكرر الخطأ تواصل مع الدعم."
      backHref="/login"
      backLabel="العودة إلى تسجيل الدخول"
    />
  );
}
