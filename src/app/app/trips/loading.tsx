import { ListPageSkeleton } from "@/components/feedback/skeletons";

export default function TripsLoading() {
  return <ListPageSkeleton cols={6} rows={6} filters={2} />;
}
