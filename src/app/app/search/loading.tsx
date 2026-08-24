import { PageHeaderSkeleton } from "@/components/feedback/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** نتائج البحث: ثلاث مجموعات نتائج. */
export default function SearchLoading() {
  return (
    <div className="space-y-4">
      <PageHeaderSkeleton withAction={false} />
      <Card>
        <CardContent className="space-y-4 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
