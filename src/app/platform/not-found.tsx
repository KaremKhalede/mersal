import { FileQuestion } from "lucide-react";
import { StateShell, BackButton } from "@/components/feedback/state-shell";

export default function PlatformNotFound() {
  return (
    <StateShell
      icon={FileQuestion}
      title="الصفحة غير موجودة"
      description="الرابط الذي فتحته غير صحيح أو أن العنصر لم يعد متاحاً."
    >
      <BackButton href="/platform" label="العودة إلى الرئيسية" variant="default" />
    </StateShell>
  );
}
