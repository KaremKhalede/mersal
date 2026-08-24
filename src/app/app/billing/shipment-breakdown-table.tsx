"use client";

import { useState } from "react";
import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ListFilter } from "lucide-react";
import { formatDate } from "@/lib/timezone";
import { formatYER } from "@/lib/money";

type Entry = {
  id: string;
  amount: number;
  cartonCount: number;
  createdAt: Date;
  shipment: { id: string; shipmentNumber: string } | null;
};

const VISIBLE_COUNT = 5;

export function ShipmentBreakdownTable({ entries }: { entries: Entry[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, VISIBLE_COUNT);

  return (
    <div className="flex flex-col">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>التاريخ</TableHead>
            <TableHead>رقم الشحنة</TableHead>
            <TableHead>عدد الكراتين</TableHead>
            <TableHead>قيمة الرسوم</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(e.createdAt)}
              </TableCell>
              <TableCell>
                {e.shipment ? (
                  <Link href={`/app/shipments/${e.shipment.id}`} className="font-medium text-primary hover:underline">
                    {e.shipment.shipmentNumber}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{e.cartonCount}</TableCell>
              <TableCell className="font-medium">{formatYER(e.amount)}</TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد شحنات على هذه الفاتورة</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
      {!showAll && entries.length > VISIBLE_COUNT && (
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAll(true)}>
            <ListFilter className="h-4 w-4" /> عرض جميع الشحنات ({entries.length})
          </Button>
        </div>
      )}
    </div>
  );
}
