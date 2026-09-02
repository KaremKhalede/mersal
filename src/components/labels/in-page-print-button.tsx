"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { getShipmentsForPrintAction } from "@/app/app/shipments/actions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge } from "@/components/ui/status-badge";
import { formatPhoneDisplay } from "@/lib/phone";
import { routeLabel } from "@/lib/utils";
import type { ShipmentStatus } from "@/lib/enums";

export function InPagePrintButton({ status, search, branchId }: { status?: ShipmentStatus; search?: string; branchId?: string | null }) {
  const [printing, setPrinting] = useState(false);
  const [printData, setPrintData] = useState<Awaited<ReturnType<typeof getShipmentsForPrintAction>> | null>(null);

  const handlePrint = async () => {
    try {
      setPrinting(true);
      const data = await getShipmentsForPrintAction({ status, search, branchId });
      setPrintData(data);
      
      // Give React a moment to render the print portal to the DOM
      setTimeout(() => {
        window.print();
        setPrinting(false);
        setPrintData(null); // Clean up after printing
      }, 300);
    } catch (e) {
      console.error("Failed to fetch print data", e);
      setPrinting(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={handlePrint} disabled={printing}>
        <Printer className="h-4 w-4" /> {printing ? "تجهيز للطباعة..." : "طباعة"}
      </Button>

      {/* When printData is set, render it into the body but ONLY visible during print */}
      {printData && typeof document !== "undefined" && createPortal(
        <div className="hidden print:block print-override bg-white text-black w-full" dir="rtl">
          <style dangerouslySetInnerHTML={{ __html: `
            @page { size: auto; margin: 0; }
            @media screen {
              .print-override { display: none !important; }
            }
            @media print {
              body > *:not(.print-override) { display: none !important; }
              body { padding: 15mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
              table { page-break-inside: auto; }
              tr { page-break-inside: avoid; page-break-after: auto; }
            }
          `}} />
          
          <div className="mb-6 flex items-center justify-between border-b-2 border-gray-900 pb-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight">{printData.companyName}</h1>
              <p className="text-gray-600 mt-1 font-medium">كشف الشحنات</p>
            </div>
            <div className="text-left text-sm font-medium text-gray-700 whitespace-nowrap">
              <p>العدد الإجمالي: {printData.items.length} شحنة</p>
              <p>تاريخ الطباعة: {new Date().toLocaleDateString("ar-SA")}</p>
            </div>
          </div>

          <Table className="text-sm">
            <TableHeader>
              <TableRow className="border-b-2 border-gray-300">
                <TableHead className="font-bold text-gray-900">رقم الشحنة</TableHead>
                <TableHead className="font-bold text-gray-900">العميل</TableHead>
                <TableHead className="font-bold text-gray-900">من ← إلى</TableHead>
                <TableHead className="text-center font-bold text-gray-900">الكراتين</TableHead>
                <TableHead className="font-bold text-gray-900">الحالة</TableHead>
                <TableHead className="font-bold text-gray-900">تاريخ الإنشاء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {printData.items.map((s) => (
                <TableRow key={s.id} className="border-b border-gray-200">
                  <TableCell className="font-bold text-gray-900">
                    {s.shipmentNumber}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start space-y-0.5">
                      <span className="font-medium">{s.customerName}</span>
                      <span className="inline-block text-xs text-gray-500" dir="ltr">{formatPhoneDisplay(s.customerPhone)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-700">{routeLabel(s.loadBranchName, s.unloadBranchName)}</TableCell>
                  <TableCell className="text-center font-medium text-gray-900" dir="ltr">{s.arrivedCartons}/{s.totalCartons}</TableCell>
                  <TableCell>
                    <ShipmentStatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {new Date(s.createdAt).toLocaleDateString("ar-SA")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>,
        document.body
      )}
    </>
  );
}
