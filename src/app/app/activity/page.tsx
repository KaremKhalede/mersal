import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchScope } from "@/lib/branch-scope";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";
import { formatDateStamp } from "@/lib/timezone";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, TableEmpty } from "@/components/feedback/empty-state";
import { History } from "lucide-react";

const ENTITY_LABELS: Record<string, string> = {
  Shipment: "شحنة",
  Trip: "رحلة",
  TripStop: "محطة",
  DeliveryRequest: "طلب توصيل",
  Document: "مستند",
};

/** Turns a raw (action, entityType, metadata) audit row into one plain Arabic sentence — the same
 * principle the shipment tracking timeline already follows (human copy, not enum names or JSON).
 * Deliberately a flat switch, not a generic i18n system: the action list is small and closed
 * (see every logAudit call site), so a lookup table would just be this switch with extra steps. */
function describeActivity(action: string, entityType: string, metadata: string | null): string {
  let meta: Record<string, unknown> = {};
  try {
    meta = metadata ? (JSON.parse(metadata) as Record<string, unknown>) : {};
  } catch {
    meta = {};
  }

  switch (action) {
    case "CREATE":
      if (entityType === "Shipment") return "تم تسجيل شحنة جديدة";
      if (entityType === "Trip") return "تم إنشاء رحلة جديدة";
      if (entityType === "DeliveryRequest") return "تم إنشاء طلب توصيل";
      return "تم الإنشاء";
    case "STATUS_CHANGE": {
      const to = typeof meta.to === "string" ? (SHIPMENT_STATUS_LABELS[meta.to as ShipmentStatus] ?? meta.to) : null;
      return to ? `تم تغيير حالة الشحنة إلى ${to}` : "تم تغيير حالة الشحنة";
    }
    case "EDIT":
      return "تم تعديل بيانات الشحنة";
    case "BULK_LOAD":
      return "تم تحميل الشحنات على الرحلة";
    case "BULK_UNLOAD":
      return "تم تفريغ الشحنات من الرحلة";
    case "DEPART_STOP":
      return "غادرت الرحلة المحطة";
    case "COMPLETE":
      return "تم إنهاء الرحلة";
    case "OUT_FOR_DELIVERY":
      return "الشحنة قيد التوصيل";
    case "DELIVERED":
      return "تم تسليم الشحنة";
    case "RECORD_PAYMENT":
      return "تم تسجيل دفعة";
    case "RAISE_EXCEPTION":
      return "أُبلغ عن مشكلة في الشحنة";
    case "RESOLVE_EXCEPTION":
      return "تم حل مشكلة الشحنة";
    case "UPLOAD":
      return "تم رفع مستند";
    default:
      return "نشاط";
  }
}

const ACTIVITY_LIMIT = 150;

export default async function ActivityLogPage() {
  const user = await requireCompanyUser();
  requireCan(user, "reports", "view");
  // AuditLog has no branch field of its own (it spans many entity types, each with a different
  // branch shape) — scoping by the acting user's branchId is the honest proxy: a branch employee
  // sees what people at their branch did, same restriction the rest of the app applies to them.
  // System-generated entries (userId null) have no branch to match, so they drop out for a
  // branch-scoped viewer, same as any other branch-scoped list defaults to "not visible" over
  // "visible by default."
  const branchScope = getBranchScope(user);
  const where = { companyId: user.companyId!, ...(branchScope ? { user: { branchId: branchScope } } : {}) };
  // The count is what makes the cap honest. The list showed 150 rows and said nothing about the
  // rest, so a company past its first weeks was reading a silently truncated log and had no way to
  // know it. An audit log is read for recency, not browsed page by page — so the fix is to state
  // the truncation, not to paginate something nobody pages through.
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, take: ACTIVITY_LIMIT }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="سجل النشاطات" description="أحدث الأحداث على مستوى الشركة" count={total} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المستخدم</TableHead>
                <TableHead>الحدث</TableHead>
                <TableHead>الكيان</TableHead>
                <TableHead>الوقت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.user?.name ?? "النظام"}</TableCell>
                  <TableCell>{describeActivity(l.action, l.entityType, l.metadata)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{ENTITY_LABELS[l.entityType] ?? l.entityType}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateStamp(l.createdAt)}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && (
                <TableEmpty colSpan={4}>
                  <EmptyState
                    icon={History}
                    title="لا توجد نشاطات بعد"
                    description="يُسجَّل هنا كل إجراء يقوم به موظفو الشركة — تسجيل شحنة، تأكيد تحميل، تسليم، تعديل بيانات."
                  />
                </TableEmpty>
              )}
            </TableBody>
          </Table>
          {total > logs.length && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              يعرض أحدث {logs.length.toLocaleString("en-US")} حدثاً من أصل {total.toLocaleString("en-US")}.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
