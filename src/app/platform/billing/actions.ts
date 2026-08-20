"use server";

import { requirePlatformAdmin } from "@/lib/auth";
import { assertCanPlatform } from "@/lib/rbac";
import {
  platformBillingByCompany,
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
} from "@/modules/billing/service";
import { parseMonth } from "@/components/platform/month-options";
import { toCsv } from "@/lib/csv";

/** CSV of the current filtered view — same month/search/status the table is showing. */
export async function exportBillingCsvAction(params: { month: string; search?: string; status?: PaymentStatus }) {
  const me = await requirePlatformAdmin();
  assertCanPlatform(me, "billing", "view");
  const month = parseMonth(params.month, new Date());

  // Not paginated: the export is the whole filtered result set by definition.
  const { items } = await platformBillingByCompany({
    month,
    search: params.search,
    status: params.status,
    page: 1,
    pageSize: 100,
  });

  const header = ["الشركة", "المعرف", "الكراتين", "المستحق (ر.ي)", "المحصل (ر.ي)", "المتبقي (ر.ي)", "نسبة التحصيل", "حالة السداد"];
  const rows = items.map((r) => [
    r.name,
    r.slug,
    String(r.cartons),
    r.due.toFixed(2),
    r.collected.toFixed(2),
    r.remaining.toFixed(2),
    `${r.rate}%`,
    PAYMENT_STATUS_LABELS[r.status],
  ]);
  return toCsv(header, rows);
}
