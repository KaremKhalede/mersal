"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CustomerFilters({
  branches,
  branchId,
  status,
  search,
  showBranchFilter = true,
}: {
  branches: { id: string; name: string }[];
  branchId?: string;
  status?: string;
  search?: string;
  /** Hidden for branch-scoped employees — their view is already pinned to their own branch. */
  showBranchFilter?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(search ?? "");

  function update(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== (search ?? "")) update({ q: q || undefined });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث عن العميل بالاسم أو الجوال..."
          className="h-8 w-full rounded-lg border border-input bg-transparent ps-3 pe-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex items-center gap-2">
        {showBranchFilter && (
          <select value={branchId ?? ""} onChange={(e) => update({ branchId: e.target.value || undefined })} className={SELECT_CLASS}>
            <option value="">جميع الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        <div className="relative">
          <Filter className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })} className={cn(SELECT_CLASS, "ps-7")}>
            <option value="">الكل</option>
            <option value="ACTIVE">نشط</option>
            <option value="INACTIVE">غير نشط</option>
          </select>
        </div>
      </div>
    </div>
  );
}
