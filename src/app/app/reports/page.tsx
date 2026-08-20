import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { periodReport } from "@/modules/reports/service";
import { listBranches } from "@/modules/branches/service";
import { getBranchScope } from "@/lib/branch-scope";
import { StatCard } from "@/components/ui/stat-card";
import { Package, Boxes, CheckCircle2 } from "lucide-react";
import { ReportFilters, ChartBranchFilter } from "./filters";
import { ExportReportButton } from "./export-report-button";
import { StatusDonut } from "./status-donut";
import { ActivityChart } from "./activity-chart";
import { TopEntitiesTable } from "./top-entities-table";

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; branchId?: string; destinationId?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "reports", "view");
  const sp = await searchParams;
  const ownScope = getBranchScope(user);

  const now = new Date();
  const defaultFrom = toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultTo = toDateInputValue(now);
  const fromStr = sp.from || defaultFrom;
  const toStr = sp.to || defaultTo;

  const [report, branches] = await Promise.all([
    periodReport(user.companyId!, {
      from: new Date(`${fromStr}T00:00:00`),
      to: new Date(`${toStr}T23:59:59`),
      branchId: sp.branchId,
      destinationId: sp.destinationId,
      branchScope: ownScope,
    }),
    listBranches(user.companyId!),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">التقارير</h2>
          <p className="text-sm text-muted-foreground">تحليل أداء الشحنات والإيرادات خلال الفترة المحددة</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportFilters branches={branches} from={fromStr} to={toStr} branchId={sp.branchId} destinationId={sp.destinationId} />
          <ExportReportButton defaultFrom={defaultFrom} defaultTo={defaultTo} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard variant="icon-start" label="تم التسليم" value={report.delivered.toLocaleString()} icon={CheckCircle2} tone="primary" />
        <StatCard variant="icon-start" label="إجمالي الكراتين" value={report.cartons.toLocaleString()} icon={Boxes} tone="success" />
        <StatCard variant="icon-start" label="إجمالي الشحنات" value={report.total.toLocaleString()} icon={Package} tone="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-4 font-heading text-base font-medium">حالة الشحنات</h3>
          <StatusDonut total={report.total} segments={report.byStatus} />
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-heading text-base font-medium">نشاط الشحنات خلال الفترة</h3>
            <ChartBranchFilter branches={branches} branchId={sp.branchId} />
          </div>
          <ActivityChart data={report.dailyActivity} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopEntitiesTable title="أكثر الفروع نشاطاً" rows={report.topBranches} tone="success" moreHref="/app/branches" moreLabel="عرض جميع الفروع" />
        <TopEntitiesTable title="أكثر الوجهات نشاطاً" rows={report.topDestinations} tone="primary" moreHref="/app/branches" moreLabel="عرض جميع الوجهات" />
      </div>
    </div>
  );
}
