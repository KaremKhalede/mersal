"use client";

import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_OPTIONS = [
  { value: "", label: "الكل" },
  { value: "ACTIVE", label: "نشط" },
  { value: "DISABLED", label: "موقوف" },
];

/** Plain GET form — every filtered view stays a shareable URL, same as the other list pages. */
export function UsersToolbar({ search, status }: { search: string; status: string }) {
  return (
    <form action="/platform/users" className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <label htmlFor="q" className="text-[11px] font-medium text-muted-foreground">البحث</label>
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={search} placeholder="ابحث بالاسم أو البريد الإلكتروني..." className="h-9 pe-9" />
          </div>
        </div>

        <div className="w-40 space-y-1.5">
          <label htmlFor="status" className="text-[11px] font-medium text-muted-foreground">الحالة</label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <Button type="submit" variant="outline" className="h-9">
          <SlidersHorizontal className="h-4 w-4" /> تصفية
        </Button>
      </div>
    </form>
  );
}
