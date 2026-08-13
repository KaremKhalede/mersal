"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { generateInvoiceAction } from "./actions";

export function GenerateInvoiceButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const invoice = await generateInvoiceAction();
            router.refresh();
            toast.success(`تم إصدار فاتورة ${invoice.invoiceNumber}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "تعذّر إصدار الفاتورة");
          }
        })
      }
    >
      <FileText className="h-4 w-4" /> إصدار فاتورة للفترة الحالية
    </Button>
  );
}
