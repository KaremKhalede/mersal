import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Mirrors the three layers of the trip screen — the trip card, the expanded current stop, then the
 * folded rows for everything else — plus the fixed action bar at the bottom.
 *
 * The shape matters more here than usual: this is the first thing a driver sees on every app open,
 * and a skeleton that resolves into a different layout reads as the screen jumping under a thumb
 * that is already moving toward the button.
 */
export default function DriverLoading() {
  return (
    <div className="space-y-3 pb-40">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-5 w-20 rounded-4xl" />
          </div>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-6 w-full rounded-4xl" />
          <Skeleton className="h-5 w-44" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <Skeleton className="h-12 w-52" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </CardContent>
      </Card>

      <Skeleton className="h-14 w-full rounded-xl" />
      <Skeleton className="h-14 w-full rounded-xl" />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background">
        <div className="mx-auto w-full max-w-md p-4">
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
