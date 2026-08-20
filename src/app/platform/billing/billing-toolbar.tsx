"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Search, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exportBillingCsvAction } from "./actions";
import type { PaymentStatus } from "@/modules/billing/service";

const STATUS_OPTIONS = [
  { value: "", label: "كل حالات السداد" },
  { value: "PAID", label: "مدفوعة" },
  { value: "PARTIAL", label: "مدفوعة جزئياً" },
  { value: "UNPAID", label: "غير مدفوعة" },
];

/**
 * Filters submit as a plain GET form so every filtered view is a shareable URL, matching the other
 * list pages. The client boundary exists only for the CSV download.
 */
export function BillingToolbar({
  month,
  search,
  status,
}: {
  month: string;
  search: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <form action="/platform/billing" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="month" value={month} />
        <div className="relative">
          <Search className="pointer-events-none absolute end-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={search}
            placeholder="ابحث عن شركة..."
            aria-label="ابحث عن شركة"
            className="h-8 w-48 pe-8 text-xs"
          />
        </div>
        <select
          name="status"
          defaultValue={status}
          aria-label="حالة السداد"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">تصفية</Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="text-muted-foreground"
        onClick={() =>
          startTransition(async () => {
            try {
              // Exports exactly what the current filters describe, not the whole table.
              const csv = await exportBillingCsvAction({ month, search, status: (status || undefined) as PaymentStatus | undefined });
              const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `الفوترة-${month}.csv`;
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
  );
}
