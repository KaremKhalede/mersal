import { FileQuestion } from "lucide-react";
import { StateShell, BackButton } from "@/components/feedback/state-shell";

export default function DriverNotFound() {
  return (
    <StateShell
      icon={FileQuestion}
      title="الصفحة غير موجودة"
      description="هذه الرحلة غير موجودة أو ليست ضمن رحلاتك."
      compact
    >
      <BackButton href="/driver" label="رحلتي الحالية" variant="default" />
    </StateShell>
  );
}
