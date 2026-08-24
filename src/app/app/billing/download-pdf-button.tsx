import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * "Download PDF" is still the browser's own print-to-PDF flow — there is no server-side PDF
 * generator to maintain. What changed is *what* gets printed.
 *
 * This used to be `onClick={() => window.print()}` on the billing page itself, which produced the
 * dashboard on paper: the StatCards, the table of every other invoice, the selection chevron, and
 * line items truncated to five of fourteen by ShipmentBreakdownTable's client-side cap. It now
 * opens the invoice's own A4 document route, which prints all of its lines and nothing else.
 *
 * A plain server component again (no "use client") — it is a link now, not a click handler.
 */
export function DownloadPdfButton({ invoiceId }: { invoiceId: string }) {
  return (
    <Button variant="outline" asChild>
      <Link href={`/app/billing/${invoiceId}/print`} target="_blank">
        <Download className="h-4 w-4" /> تحميل PDF
      </Link>
    </Button>
  );
}
