"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Printer, Link2, Receipt } from "lucide-react";

/**
 * The shipments list was the only one of the six that answered "what can I do with this row?" with
 * two bare ghost icons instead of the "⋯" every other list uses. Three shapes across six lists
 * (icons here, a menu on customers/employees/vehicles/branches, five labelled buttons on delivery)
 * is the clearest "built one page at a time" tell in the product.
 *
 * The rule those six now share is not "everything is a ⋯" — that would bury the delivery queue's
 * next workflow step, which has to stay a visible button for the same reason the shipment page's
 * primary does. The rule is:
 *
 *   the one next step in the workflow stays a button; navigation, secondary and destructive go in ⋯
 *
 * A shipments row has no workflow step to take from the list, so all of it is ⋯.
 *
 * "عرض التفاصيل" is in the menu for discoverability, not because it is the only way there — the
 * shipment number in the first column has always been the real link, and an eye icon that duplicates
 * it was spending a column on a second door to the same room.
 */
export function ShipmentRowActions({ id, trackingToken }: { id: string; trackingToken: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" aria-label="إجراءات الشحنة">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/app/shipments/${id}`}><Eye className="h-4 w-4" /> عرض التفاصيل</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/app/shipments/${id}/label`} target="_blank"><Printer className="h-4 w-4" /> طباعة الملصقات</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/app/shipments/${id}/receipt`} target="_blank"><Receipt className="h-4 w-4" /> طباعة إيصال الاستلام</Link>
        </DropdownMenuItem>
        {/* Same action the shipment page offers, reachable without opening the shipment: a customer
            who lost the WhatsApp message is a phone call, and the answer is one click from the list. */}
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard.writeText(`${window.location.origin}/track/${trackingToken}`);
            toast.success("تم نسخ رابط التتبع");
          }}
        >
          <Link2 className="h-4 w-4" /> نسخ رابط التتبع
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
