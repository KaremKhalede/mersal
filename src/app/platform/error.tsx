"use client";

import { ErrorState } from "@/components/feedback/error-state";

export default function PlatformError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorState
      error={error}
      retry={retry}
      description="حدث خطأ أثناء تحميل هذه الصفحة في لوحة إدارة المنصة. حاول مرة أخرى."
      backHref="/platform"
      backLabel="العودة إلى الرئيسية"
    />
  );
}
