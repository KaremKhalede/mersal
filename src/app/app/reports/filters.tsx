"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays } from "lucide-react";

const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ReportFilters({
  branches,
  from,
  to,
  branchId,
  destinationId,
}: {
  branches: { id: string; name: string }[];
  from: string;
  to: string;
  branchId?: string;
  destinationId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={branchId ?? ""} onChange={(e) => update({ branchId: e.target.value || undefined })} className={SELECT_CLASS}>
        <option value="">كل الفروع</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <select value={destinationId ?? ""} onChange={(e) => update({ destinationId: e.target.value || undefined })} className={SELECT_CLASS}>
        <option value="">كل الوجهات</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <div className="flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-sm">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input type="date" value={from} max={to} onChange={(e) => update({ from: e.target.value })} className="w-[120px] bg-transparent outline-none" />
        <span className="text-muted-foreground">–</span>
        <input type="date" value={to} min={from} onChange={(e) => update({ to: e.target.value })} className="w-[120px] bg-transparent outline-none" />
      </div>
    </div>
  );
}

/** Standalone scope selector reused atop the activity chart card — same `branchId` query param as
 * the page-level filter above, so picking a branch here and up top always agree. */
export function ChartBranchFilter({ branches, branchId }: { branches: { id: string; name: string }[]; branchId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("branchId", value);
    else params.delete("branchId");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select value={branchId ?? ""} onChange={(e) => update(e.target.value)} className={SELECT_CLASS}>
      <option value="">كل الفرع</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
