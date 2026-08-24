import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** الفروع: ترويسة + فلاتر + جدول ستة أعمدة. */
export default function BranchesLoading() {
  return <ListPageSkeleton cols={6} rows={6} filters={2} />;
}
