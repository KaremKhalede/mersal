"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/** "Download PDF" == the browser's own print-to-PDF flow — no server-side PDF generation to
 * maintain when window.print() + print CSS already renders the invoice cleanly (see the
 * print:hidden classes throughout this page). */
export function DownloadPdfButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Download className="h-4 w-4" /> تحميل PDF
    </Button>
  );
}
