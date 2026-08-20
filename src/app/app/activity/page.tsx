import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchScope } from "@/lib/branch-scope";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SHIPMENT_STATUS_LABELS, type ShipmentStatus } from "@/lib/enums";
import { formatBusinessDateTime } from "@/lib/timezone";

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
  const logs = await prisma.auditLog.findMany({
    where: { companyId: user.companyId!, ...(branchScope ? { user: { branchId: branchScope } } : {}) },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">سجل النشاطات</h2>
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
                  <TableCell className="text-xs text-muted-foreground">{formatBusinessDateTime(l.createdAt, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</TableCell>
                </TableRow>
              ))}
              {logs.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">لا توجد نشاطات مسجّلة</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
