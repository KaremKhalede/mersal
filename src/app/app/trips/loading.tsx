import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** Header + 1 filter + the list. `responsive` for the same reason as the shipments list: cards
 *  below lg, a 6-column table above it. */
export default function TripsLoading() {
  return <ListPageSkeleton cols={6} rows={6} filters={2} responsive />;
}
