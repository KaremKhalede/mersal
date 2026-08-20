import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** Shipments list: header + 5 KPI cards + filters + 7-column table. */
export default function ShipmentsLoading() {
  return <ListPageSkeleton stats={5} cols={6} rows={8} filters={3} />;
}
