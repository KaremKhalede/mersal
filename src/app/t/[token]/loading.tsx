import { Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the tracking card's real shape — number row, the two carton counters, then the six
 * timeline steps — so the customer sees the page they are about to get rather than a blank screen
 * while it loads over a weak mobile connection.
 */
export default function TrackLoading() {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="space-y-1 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Package className="h-6 w-6" />
          </div>
          <div className="flex justify-center pt-1">
            <Skeleton className="h-3.5 w-32" />
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-28" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16 rounded-lg" />
            <Skeleton className="h-16 rounded-lg" />
          </div>

          <div className="space-y-4 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-40" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
