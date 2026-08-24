import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** العملاء: ترويسة + فلاتر + جدول سبعة أعمدة. */
export default function CustomersLoading() {
  return <ListPageSkeleton cols={7} rows={10} filters={3} />;
}
