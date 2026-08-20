"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { exportInvoicesCsvAction } from "./actions";

export function ExportInvoicesButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const csv = await exportInvoicesCsvAction();
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `الفواتير-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "تعذّر تصدير الفواتير");
          }
        })
      }
    >
      <FileDown className="h-4 w-4" /> {pending ? "جارٍ التصدير..." : "تصدير الفواتير"}
    </Button>
  );
}
