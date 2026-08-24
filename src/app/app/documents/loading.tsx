import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** المستندات: جدول من أربعة أعمدة. */
export default function DocumentsLoading() {
  return <ListPageSkeleton cols={4} rows={8} filters={0} />;
}
