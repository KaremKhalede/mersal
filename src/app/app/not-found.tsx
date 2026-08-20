import { FileQuestion } from "lucide-react";
import { StateShell, BackButton } from "@/components/feedback/state-shell";

export default function CompanyNotFound() {
  return (
    <StateShell
      icon={FileQuestion}
      title="الصفحة غير موجودة"
      description="الرابط الذي فتحته غير صحيح أو أن العنصر لم يعد متاحاً. تأكد من الرابط أو ارجع إلى لوحة التحكم."
    >
      <BackButton href="/app" label="العودة إلى لوحة التحكم" variant="default" />
    </StateShell>
  );
}
