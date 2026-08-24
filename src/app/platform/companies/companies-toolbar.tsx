"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Search, SlidersHorizontal, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportCompaniesCsvAction } from "./actions";
import type { CompanyPeriod } from "@/modules/companies/service";

const STATUS_OPTIONS = [
  { value: "", label: "جميع الحالات" },
  { value: "ACTIVE", label: "نشطة" },
  { value: "SUSPENDED", label: "متوقفة" },
];

const PERIOD_OPTIONS: { value: CompanyPeriod; label: string }[] = [
  { value: "all", label: "جميع الفترات" },
  { value: "30d", label: "آخر 30 يوماً" },
  { value: "90d", label: "آخر 90 يوماً" },
  { value: "year", label: "هذا العام" },
];

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Filters are submitted as a normal GET form, so every filtered view is a real URL that can be
 * bookmarked, shared and back-buttoned — same convention as the other list pages. The client
 * component exists only for the export download.
 */
export function CompaniesToolbar({
  search,
  status,
  period,
}: {
  search: string;
  status: string;
  period: CompanyPeriod;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <form
      action="/platform/companies"
      className="rounded-xl border bg-card p-3 shadow-sm"
      onSubmit={() => {
        // Any filter change returns to page 1 — staying on page 9 of a narrower result set is a
        // dead end.
        if (params.get("page")) router.push("/platform/companies");
      }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_auto_auto]">
        <div className="space-y-1.5">
          <label htmlFor="q" className="text-2xs font-medium text-muted-foreground">البحث</label>
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="q" name="q" defaultValue={search} placeholder="ابحث عن اسم الشركة..." className="h-9 pe-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="status" className="text-2xs font-medium text-muted-foreground">الحالة</label>
          <select id="status" name="status" defaultValue={status} className={selectClass}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="period" className="text-2xs font-medium text-muted-foreground">فترة التسجيل</label>
          <select id="period" name="period" defaultValue={period} className={selectClass}>
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <Button type="submit" variant="outline" className="h-9 w-full justify-center">
            <SlidersHorizontal className="h-4 w-4" /> تصفية
          </Button>
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="h-9 w-full justify-center text-muted-foreground"
            onClick={() =>
              startTransition(async () => {
                try {
                  const csv = await exportCompaniesCsvAction({ search, status, period });
                  // BOM so Excel opens the Arabic headers as UTF-8 rather than mojibake.
                  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `الشركات-${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "تعذّر تصدير البيانات");
                }
              })
            }
          >
            <FileDown className="h-4 w-4" /> {pending ? "جارٍ التصدير..." : "تصدير"}
          </Button>
        </div>
      </div>
    </form>
  );
}
