"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/** The only interactive piece of Pagination — kept in its own client module so the rest of the
 * component (Links/Buttons) stays server-rendered for every existing caller that doesn't need it.
 * Builds its own next URL via next/navigation hooks rather than taking a href-building function
 * prop — a plain function can't cross the Server -> Client Component boundary Pagination itself
 * sits on. */
export function PageSizeSelect({ pageSizeParam = "pageSize", pageSize, pageSizeOptions }: { pageSizeParam?: string; pageSize: number; pageSizeOptions: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      عرض
      <select
        value={pageSize}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set(pageSizeParam, e.target.value);
          params.set("page", "1");
          router.push(`${pathname}?${params.toString()}`);
        }}
        className="h-7 rounded-md border border-input bg-transparent px-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {pageSizeOptions.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}
