import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** طلبات التوصيل: جدول واحد بلا فلاتر. */
export default function DeliveryLoading() {
  return <ListPageSkeleton cols={7} rows={6} filters={0} />;
}
