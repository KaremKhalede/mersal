import { ListPageSkeleton } from "@/components/feedback/skeletons";

export default function PlatformCompaniesLoading() {
  return <ListPageSkeleton stats={4} cols={7} rows={8} filters={3} />;
}
