import { PageHeaderSkeleton, StatCardsSkeleton, TableSkeleton } from "@/components/feedback/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shaped for the tab this route actually opens on — المستحقات على العملاء: a tab bar, three stat
 * cards, the four aging buckets, then the customer list. It drew four cards and an eight-column
 * table before, which is the platform-fees tab and no longer what loads first; a skeleton that
 * predicts the wrong layout makes the page jump on arrival, which is the one thing a skeleton
 * exists to prevent.
 *
 * The other two tabs are close enough in silhouette (a header, a row of figures, a table) that a
 * per-tab skeleton would be three files to remove a shift nobody can perceive.
 */
export default function BillingLoading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton withAction={false} />
      <div className="flex gap-4 border-b pb-2.5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-4 w-28" />
        ))}
      </div>
      <StatCardsSkeleton count={3} />
      <div className="rounded-xl border bg-card p-4">
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[86px] w-full rounded-lg" />
          ))}
        </div>
      </div>
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}
