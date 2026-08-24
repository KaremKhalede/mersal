import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** الأدوار: جدول واحد، الإنشاء من ترويسة الصفحة. */
export default function RolesLoading() {
  return <ListPageSkeleton cols={5} rows={6} filters={0} />;
}
