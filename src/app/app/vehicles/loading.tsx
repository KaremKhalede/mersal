import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** المركبات: ترويسة + فلاتر + جدول خمسة أعمدة. */
export default function VehiclesLoading() {
  return <ListPageSkeleton cols={5} rows={10} filters={2} />;
}
