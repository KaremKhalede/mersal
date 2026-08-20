"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { exportShipmentsCsvAction } from "./actions";
import type { ShipmentStatus } from "@/lib/enums";

export function ExportButton({ status, search, branchId }: { status?: ShipmentStatus; search?: string; branchId?: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const csv = await exportShipmentsCsvAction({ status, search, branchId });
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `الشحنات-${new Date().toISOString().slice(0, 10)}.csv`;
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
  );
}
