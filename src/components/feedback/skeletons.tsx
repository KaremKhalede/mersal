import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Loading skeletons for the heavy routes.
 *
 * These deliberately mirror the real layout — same grid, same column count, same card heights — so
 * the page does not visibly jump when the content swaps in. A centred spinner would be less work
 * but tells the user nothing about what is arriving, and on a slow connection (the normal case for
 * a branch in Yemen) that difference is most of the perceived speed.
 *
 * Animation is the one `animate-pulse` already defined on Skeleton. Nothing spins, slides or
 * shimmers: at 20 rows that reads as a broken page, not a loading one.
 */

export function PageHeaderSkeleton({ withAction = true }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      {withAction && <Skeleton className="h-9 w-32 rounded-lg" />}
    </div>
  );
}

/** The 2-up / 4-up KPI row used by both dashboards and most list pages. */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4", count >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Header row + `rows` body rows, matching ui/table's spacing. Cardless so the responsive shell
 *  below can place it beside a card list without nesting two Cards. */
function TableRowsSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={cn("h-3.5", i === 0 ? "w-28" : "flex-1 max-w-24")} />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-4 py-3.5 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-4", c === 0 ? "w-28" : "flex-1 max-w-24")} />
          ))}
        </div>
      ))}
    </>
  );
}

/** A table shell with a header row and `rows` body rows, matching ui/table's spacing. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <TableRowsSkeleton rows={rows} cols={cols} />
      </CardContent>
    </Card>
  );
}

/**
 * For the two lists that swap shape at `lg`: shipments and trips render a card list below it and
 * the table at and above it.
 *
 * The breakpoint here has to be the same `lg` those pages use. A skeleton that guesses the wrong
 * shape is worse than none — the page visibly re-flows the moment content lands, which is exactly
 * the jump these skeletons exist to prevent. The card body mirrors the real row: identifier and
 * status badge on one line, then two lines of detail, all inside `p-3`.
 */
export function ResponsiveListSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y lg:hidden">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-5 w-20 rounded-4xl" />
              </div>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <TableRowsSkeleton rows={rows} cols={cols} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Filter/toolbar row that sits above most lists. */
export function FiltersSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-8 rounded-lg", i === 0 ? "w-64" : "w-36")} />
      ))}
    </div>
  );
}

/** The two-column detail layout (main panel + info sidebar) used by shipment and trip detail. */
export function DetailSkeleton({ sidebarRows = 8 }: { sidebarRows?: number }) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-32" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-4">
            <div className="flex gap-4 border-b pb-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-20" />
              ))}
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="mt-1 h-2 w-2 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-4">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: sidebarRows }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Standard list page: header, filters, table. The shape most routes here need. */
export function ListPageSkeleton({
  stats = 0,
  cols = 5,
  rows = 6,
  filters = 3,
  responsive = false,
}: {
  stats?: number;
  cols?: number;
  rows?: number;
  filters?: number;
  /** Set for a list that becomes cards below `lg` — currently shipments and trips. */
  responsive?: boolean;
}) {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton />
      {stats > 0 && <StatCardsSkeleton count={stats} />}
      {filters > 0 && <FiltersSkeleton count={filters} />}
      {responsive ? <ResponsiveListSkeleton rows={rows} cols={cols} /> : <TableSkeleton rows={rows} cols={cols} />}
    </div>
  );
}
