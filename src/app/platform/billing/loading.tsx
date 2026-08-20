import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/feedback/skeletons";

export default function PlatformBillingLoading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <TableSkeleton rows={8} cols={8} />
    </div>
  );
}
