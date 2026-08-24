import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listExceptions } from "@/modules/shipments/service";
import { exceptionRecoveryTargets, RECOVERY_ACTION_LABELS } from "@/modules/shipments/state-machine";
import type { ShipmentStatus } from "@/lib/enums";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { formatDateStamp } from "@/lib/timezone";
import { EXCEPTION_TYPE_LABELS, type ExceptionType } from "@/lib/enums";
import { ResolveExceptionButton } from "@/app/app/shipments/[id]/resolve-exception-button";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { ShieldCheck } from "lucide-react";
import { routeLabel } from "@/lib/utils";

export default async function ExceptionsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "updateStatus");
  const shipments = await listExceptions(user.companyId!, getBranchScope(user));

  return (
    <div className="space-y-4">
      <PageHeader title="الاستثناءات المفتوحة" count={shipments.length} description="شحنات موقوفة بانتظار قرار" />
      {/* A primary list page, so it gets the product's empty state rather than a grey line — and
          the wording reads as the good news it is. No action button: an exception is raised from a
          shipment or by a driver, never created here. */}
      {shipments.length === 0 && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldCheck}
              title="لا توجد استثناءات مفتوحة"
              description="تظهر هنا الشحنات الموقوفة بانتظار قرار — يبلّغ عنها موظف من صفحة الشحنة أو سائق من تطبيقه."
            />
          </CardContent>
        </Card>
      )}
      <div className="space-y-3">
        {shipments.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                <Link href={`/app/shipments/${s.id}`} className="text-primary hover:underline">{s.shipmentNumber}</Link>
                <span className="text-muted-foreground font-normal ms-2">{s.customer.name}</span>
              </CardTitle>
              <Badge variant="destructive">{EXCEPTION_TYPE_LABELS[s.exceptionType as ExceptionType] ?? "استثناء"}</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{routeLabel(s.loadBranch.name, s.unloadBranch.name)}</p>
              {s.exceptionNote && <p className="text-sm">{s.exceptionNote}</p>}
              <p className="text-xs text-muted-foreground">{formatDateStamp(s.updatedAt)}</p>
              {/* Same rule the shipment page and the server use — one function, three call sites,
                  so a recovery offered here is a recovery resolveException will accept. */}
              <ResolveExceptionButton
                shipmentId={s.id}
                options={exceptionRecoveryTargets(s.statusBeforeException as ShipmentStatus | null).map((status) => ({
                  status,
                  label: RECOVERY_ACTION_LABELS[status],
                  isPrimary: status === s.statusBeforeException,
                }))}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
