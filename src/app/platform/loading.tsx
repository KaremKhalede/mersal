import { PageHeaderSkeleton, StatCardsSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformLoading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
