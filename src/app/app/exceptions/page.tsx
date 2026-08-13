import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listExceptions } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { EXCEPTION_TYPE_LABELS, type ExceptionType } from "@/lib/enums";
import { ResolveExceptionButton } from "@/app/app/shipments/[id]/resolve-exception-button";

export default async function ExceptionsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "updateStatus");
  const shipments = await listExceptions(user.companyId!, getBranchScope(user));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">الاستثناءات المفتوحة ({shipments.length})</h2>
      {shipments.length === 0 && <p className="text-sm text-muted-foreground">لا توجد استثناءات مفتوحة حالياً</p>}
      <div className="space-y-3">
        {shipments.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                <Link href={`/app/shipments/${s.id}`} className="text-primary hover:underline">{s.shipmentNumber}</Link>
                <span className="text-muted-foreground font-normal ms-2">{s.customer.name}</span>
              </CardTitle>
              <span className="text-xs font-medium rounded-full bg-destructive/10 text-destructive px-2 py-1">
                {EXCEPTION_TYPE_LABELS[s.exceptionType as ExceptionType] ?? "استثناء"}
              </span>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{s.loadBranch.name} ← {s.unloadBranch.name}</p>
              {s.exceptionNote && <p className="text-sm">{s.exceptionNote}</p>}
              <p className="text-xs text-muted-foreground">{new Date(s.updatedAt).toLocaleString("ar-SA")}</p>
              <ResolveExceptionButton shipmentId={s.id} statusBeforeException={s.statusBeforeException} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
