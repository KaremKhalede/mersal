import { DetailSkeleton } from "@/components/feedback/skeletons";

/** تفاصيل المركبة + رحلاتها. */
export default function VehicleDetailLoading() {
  return <DetailSkeleton sidebarRows={5} />;
}
