import { DetailSkeleton } from "@/components/feedback/skeletons";

/** تفاصيل العميل: بطاقة معلومات + شحناته. */
export default function CustomerDetailLoading() {
  return <DetailSkeleton sidebarRows={6} />;
}
