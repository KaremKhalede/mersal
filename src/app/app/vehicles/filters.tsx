"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

const SELECT_CLASS = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function VehicleFilters({ status, search }: { status?: string; search?: string }) {
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
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          dir="ltr"
          placeholder="ابحث برقم اللوحة..."
          className="h-8 w-full rounded-lg border border-input bg-transparent ps-3 pe-9 text-sm text-end outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="relative">
        <Filter className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <select value={status ?? ""} onChange={(e) => update({ status: e.target.value || undefined })} className={cn(SELECT_CLASS, "ps-7")}>
          <option value="">كل الحالات</option>
          <option value="ACTIVE">نشطة</option>
          <option value="INACTIVE">غير نشطة</option>
        </select>
      </div>
    </div>
  );
}
