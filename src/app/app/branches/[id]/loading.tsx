import { DetailSkeleton } from "@/components/feedback/skeletons";

/** تفاصيل الفرع + موظفيه. */
export default function BranchDetailLoading() {
  return <DetailSkeleton sidebarRows={5} />;
}
