"use client";

import { useRouter } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";

/** Month options, newest first, as `YYYY-MM` values. `basePath` is the route the choice navigates
 * to, so the same control drives both the dashboard and the usage page. */
export function MonthPicker({
  months,
  value,
  basePath = "/platform",
}: {
  months: { value: string; label: string }[];
  value: string;
  basePath?: string;
}) {
  const router = useRouter();

  return (
    <label className="relative inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm transition-colors hover:bg-accent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="font-medium">{months.find((m) => m.value === value)?.label ?? value}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      <select
        aria-label="اختر الشهر"
        value={value}
        onChange={(e) => router.push(`${basePath}?month=${e.target.value}`)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {months.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
