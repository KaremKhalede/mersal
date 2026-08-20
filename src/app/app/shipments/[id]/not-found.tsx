import { PackageX } from "lucide-react";
import { StateShell, BackButton } from "@/components/feedback/state-shell";

/** Reached when getShipmentDetail returns nothing — either the shipment does not exist, or it
 *  belongs to another company/branch and is correctly invisible to this employee. The copy does
 *  not distinguish the two: confirming that some other branch's shipment exists would leak it. */
export default function ShipmentNotFound() {
  return (
    <StateShell
      icon={PackageX}
      title="لم نجد هذه الشحنة"
      description="الشحنة غير موجودة أو أنها خارج نطاق صلاحيتك. تأكد من رقم الشحنة من قائمة الشحنات."
    >
      <BackButton href="/app/shipments" label="العودة إلى الشحنات" variant="default" />
    </StateShell>
  );
}
