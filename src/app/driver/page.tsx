import { PackageX } from "lucide-react";
import { requireDriver } from "@/lib/auth";
import { getDriverTrips } from "@/modules/trips/service";
import { StateShell } from "@/components/feedback/state-shell";
import { DriverTripView } from "./trip/[id]/trip-view";

/**
 * The driver's entry point — the trip itself, not a doorway to it.
 *
 * It used to render a summary card (route, shipment/carton totals, next stop) behind a
 * "عرض تفاصيل الرحلة" button, on top of a full trip query the next page then repeated. Its only
 * unique contribution was a tap, taken on a phone, in a truck, at every stop. The summary moved
 * into the trip view's own header and this route renders that view directly.
 *
 * Which trip is "the" trip is decided by getDriverTrips, not here: a driver can hold more than one
 * assignment at a time, and the one that has already started outranks the one the office typed in
 * most recently. See that function for the failure this replaced.
 */
export default async function DriverHomePage() {
  const user = await requireDriver();
  const { active } = await getDriverTrips(user.id);

  // Also where driver-complete-button used to land: a COMPLETED trip stops matching the query
  // above. It now stays on the finished trip (which says so) and this page is what the driver sees
  // on their next visit — either the next assignment, or this.
  if (!active) {
    return (
      <StateShell
        compact
        icon={PackageX}
        title="لا توجد رحلة نشطة"
        description="لم تُسنَد إليك رحلة حالياً. ستظهر هنا فور أن يعيّنك المكتب على رحلة جديدة."
      />
    );
  }

  return <DriverTripView tripId={active.id} />;
}
