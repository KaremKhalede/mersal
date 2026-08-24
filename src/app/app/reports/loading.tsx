import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** التقارير: ثلاثة أرقام ثم لوحات التحليل. */
export default function ReportsLoading() {
  return <ListPageSkeleton stats={3} cols={3} rows={5} filters={2} />;
}
