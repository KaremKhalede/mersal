import { ListPageSkeleton } from "@/components/feedback/skeletons";

/** الموظفون: ترويسة + أربعة فلاتر + جدول ثمانية أعمدة. */
export default function EmployeesLoading() {
  return <ListPageSkeleton cols={8} rows={10} filters={4} />;
}
