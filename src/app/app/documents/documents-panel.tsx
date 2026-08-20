"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download } from "lucide-react";
import { uploadDocumentAction } from "./actions";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/enums";
import { formatBusinessDate } from "@/lib/timezone";

type Doc = { id: string; docType: string; fileName: string; filePath: string; uploadedAt: Date | string };

export function DocumentsPanel({ shipmentId, documents }: { companyId: string; shipmentId: string; documents: Doc[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(formData: FormData) {
    formData.set("shipmentId", shipmentId);
    startTransition(async () => {
      const result = await uploadDocumentAction(formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("تم رفع المستند");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form action={handleSubmit} className="flex flex-wrap items-end gap-2 border-b pb-4">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">نوع المستند</label>
          <Select name="docType" defaultValue="OTHER">
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">الملف</label>
          <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" className="block text-sm" />
        </div>
        <Button type="submit" disabled={pending} size="sm">{pending ? "جارٍ الرفع..." : "رفع"}</Button>
      </form>

      <div className="space-y-2">
        {documents.map((d) => (
          <a key={d.id} href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{d.fileName}</p>
              <p className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[d.docType as DocumentType] ?? d.docType} · <span dir="ltr">{formatBusinessDate(new Date(d.uploadedAt))}</span></p>
            </div>
            <Download className="h-4 w-4 text-muted-foreground" />
          </a>
        ))}
        {documents.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">لا توجد مستندات</p>}
      </div>
    </div>
  );
}
