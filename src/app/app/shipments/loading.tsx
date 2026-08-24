import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** Header + 5 KPI cards + 3 filters + the list. `responsive` because this page is a card list
 *  below lg and a 7-column table above it — the skeleton has to switch at the same width. */
export default function ShipmentsLoading() {
  return <ListPageSkeleton stats={5} cols={7} rows={8} filters={3} responsive />;
}
