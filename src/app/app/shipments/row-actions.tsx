import Link from "next/link";
import { Eye, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShipmentRowActions({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="icon-sm" title="عرض التفاصيل">
        <Link href={`/app/shipments/${id}`}><Eye className="h-4 w-4" /></Link>
      </Button>
      <Button asChild variant="ghost" size="icon-sm" title="طباعة الملصقات">
        <Link href={`/app/shipments/${id}/label`} target="_blank"><Printer className="h-4 w-4" /></Link>
      </Button>
    </div>
  );
}
