import { ReceiptText } from "lucide-react";
import { StateShell, BackButton } from "@/components/feedback/state-shell";

export default function InvoiceNotFound() {
  return (
    <StateShell
      icon={ReceiptText}
      title="لم نجد هذه الفاتورة"
      description="الفاتورة غير موجودة أو أنها تخص شركة أخرى. افتحها من قائمة الفواتير في صفحة المالية."
    >
      <BackButton href="/app/billing" label="العودة إلى المالية" variant="default" />
    </StateShell>
  );
}
