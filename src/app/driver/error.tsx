"use client";

import { ErrorState } from "@/components/feedback/error-state";

/** compact: the driver layout is a max-w-md single column on a phone, where the full-height
 *  centred treatment would push the actions below the fold. */
export default function DriverError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      error={error}
      retry={retry}
      title="تعذّر تحميل الصفحة"
      description="قد يكون الاتصال ضعيفاً. تحقق من الشبكة ثم حاول مرة أخرى."
      backHref="/driver"
      backLabel="رحلتي"
      compact
    />
  );
}
