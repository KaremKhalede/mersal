"use server";

import { requireCompanyUser } from "@/lib/auth";
import { assertCan } from "@/lib/rbac";
import { getBranchScope } from "@/lib/branch-scope";
import { periodReport } from "@/modules/reports/service";
import { csvEscape } from "@/lib/csv";

/** CSV text for the "تصدير التقرير" button — the same filtered slice currently on screen (status
 * breakdown, daily activity, top branches/destinations), same BOM-prefix convention as every other
 * export button in the app (see exportShipmentsCsvAction's docstring). */
export async function exportReportCsvAction(params: { from: string; to: string; branchId?: string; destinationId?: string }) {
  const user = await requireCompanyUser();
  assertCan(user, "reports", "view");
  const branchScope = getBranchScope(user);

  const report = await periodReport(user.companyId!, {
    from: new Date(`${params.from}T00:00:00`),
    to: new Date(`${params.to}T23:59:59`),
    branchId: params.branchId,
    destinationId: params.destinationId,
    branchScope,
  });

  // This export is several stacked tables rather than one header+rows document, so it uses
  // csvEscape directly instead of toCsv(). Same cell rules either way — see src/lib/csv.ts.
  const section = (rows: string[][]) => rows.map((row) => row.map(csvEscape).join(",")).join("\n");

  const sections = [
    section([["الفترة", `${params.from} - ${params.to}`], ["إجمالي الشحنات", String(report.total)], ["إجمالي الكراتين", String(report.cartons)], ["تم التسليم", String(report.delivered)]]),
    section([["الحالة", "العدد"], ...report.byStatus.map((s) => [s.label, String(s.count)])]),
    section([["التاريخ", "عدد الشحنات"], ...report.dailyActivity.map((d) => [d.label, String(d.count)])]),
    section([["الفرع", "الشحنات", "الكراتين", "النسبة"], ...report.topBranches.map((b) => [b.branch.name, String(b.shipments), String(b.cartons), `${b.pct}%`])]),
    section([["الوجهة", "الشحنات", "الكراتين", "النسبة"], ...report.topDestinations.map((b) => [b.branch.name, String(b.shipments), String(b.cartons), `${b.pct}%`])]),
  ];
  return sections.join("\n\n");
}
