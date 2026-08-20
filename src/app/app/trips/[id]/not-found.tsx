import { TruckIcon } from "lucide-react";
import { StateShell, BackButton } from "@/components/feedback/state-shell";

export default function TripNotFound() {
  return (
    <StateShell
      icon={TruckIcon}
      title="لم نجد هذه الرحلة"
      description="الرحلة غير موجودة أو أنها خارج نطاق صلاحيتك. تأكد من رقم الرحلة من قائمة الرحلات."
    >
      <BackButton href="/app/trips" label="العودة إلى الرحلات" variant="default" />
    </StateShell>
  );
}
