"use client";

import { useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { exportReportCsvAction } from "./actions";

export function ExportReportButton({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const csv = await exportReportCsvAction({
              from: searchParams.get("from") || defaultFrom,
              to: searchParams.get("to") || defaultTo,
              branchId: searchParams.get("branchId") || undefined,
              destinationId: searchParams.get("destinationId") || undefined,
            });
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `تقرير-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "تعذّر تصدير التقرير");
          }
        })
      }
    >
      <FileDown className="h-4 w-4" /> {pending ? "جارٍ التصدير..." : "تصدير التقرير"}
    </Button>
  );
}
