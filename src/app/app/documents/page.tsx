import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listDocuments } from "@/modules/documents/service";
import { prisma } from "@/lib/db";
import { getBranchScope } from "@/lib/branch-scope";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/enums";
import { formatBusinessDate } from "@/lib/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, TableEmpty } from "@/components/feedback/empty-state";
import { FileText } from "lucide-react";

export default async function DocumentsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "documents", "view");
  const documents = await listDocuments(user.companyId!, undefined, getBranchScope(user));
  const shipmentIds = [...new Set(documents.filter((d) => d.shipmentId).map((d) => d.shipmentId!))];
  const shipments = await prisma.shipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, shipmentNumber: true } });
  const shipmentMap = new Map(shipments.map((s) => [s.id, s.shipmentNumber]));

  return (
    <div className="space-y-4">
      <PageHeader title="المستندات" count={documents.length} description="المستندات المرفوعة على الشحنات" />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الملف</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الشحنة</TableHead>
                <TableHead>تاريخ الرفع</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell><a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{d.fileName}</a></TableCell>
                  <TableCell>{DOCUMENT_TYPE_LABELS[d.docType as DocumentType] ?? d.docType}</TableCell>
                  <TableCell>
                    {d.shipmentId ? <Link href={`/app/shipments/${d.shipmentId}`} className="text-primary hover:underline">{shipmentMap.get(d.shipmentId)}</Link> : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums" dir="ltr">{formatBusinessDate(d.uploadedAt)}</TableCell>
                </TableRow>
              ))}
              {documents.length === 0 && (
                <TableEmpty colSpan={4}>
                  <EmptyState
                    icon={FileText}
                    title="لا توجد مستندات"
                    description="تُرفع المستندات من داخل الشحنة، في تبويب المرفقات — وتظهر هنا مجمّعة."
                  />
                </TableEmpty>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
