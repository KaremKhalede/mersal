import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** سجل النشاطات: جدول من أربعة أعمدة بلا فلاتر. */
export default function ActivityLoading() {
  return <ListPageSkeleton cols={4} rows={10} filters={0} />;
}
