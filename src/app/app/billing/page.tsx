import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/page-header";
import { ExportInvoicesButton } from "./export-invoices-button";
import { PlatformFeesPanel } from "./platform-fees-panel";

/**
 * ============================================================================================
 * المالية — رسوم المنصة فقط
 * ============================================================================================
 *
 * This page answers one question:
 *   كم علينا للمنصة؟  -> platform-fees-panel.tsx
 *
 * Customer-facing collections, receivables, and daily cash drawer functions have been removed
 * to keep the platform purely focused on what the company owes Chargee.
 */

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string; limit?: string }>;
}) {
  const user = await requireCompanyUser();
  requireCan(user, "billing", "view");

  const sp = await searchParams;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          title="المالية"
          description="ما على الشركة للمنصة — الفواتير والمدفوعات"
          actions={<ExportInvoicesButton />}
        />
      </div>

      <PlatformFeesPanel companyId={user.companyId!} invoiceId={sp.invoice} limit={sp.limit} />
    </div>
  );
}

