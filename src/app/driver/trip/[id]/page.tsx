import { DriverTripView } from "./trip-view";

/** Direct link to one trip, and the parent route of report-problem. Ownership is checked inside
 *  DriverTripView, which /driver renders too — one guard, one screen. */
export default async function DriverTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DriverTripView tripId={id} />;
}
