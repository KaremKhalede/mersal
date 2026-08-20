"use client";

import { ErrorState } from "@/components/feedback/error-state";

/** Catches any failed render inside the company dashboard. The sidebar and top bar stay mounted
 *  (they live in the layout above this boundary), so the employee never loses their place. */
export default function CompanyError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      error={error}
      retry={retry}
      description="حدث خطأ أثناء تحميل هذه الصفحة. بياناتك لم تتأثر — حاول مرة أخرى، وإذا تكرر الخطأ تواصل مع الدعم."
      backHref="/app"
      backLabel="العودة إلى لوحة التحكم"
    />
  );
}
