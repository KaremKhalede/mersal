"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Copy, Printer } from "lucide-react";

export function InvoiceActionsMenu({ invoiceNumber }: { invoiceNumber: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon"><MoreVertical className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> طباعة
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(invoiceNumber);
            toast.success("تم نسخ رقم الفاتورة");
          }}
        >
          <Copy className="h-4 w-4" /> نسخ رقم الفاتورة
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
