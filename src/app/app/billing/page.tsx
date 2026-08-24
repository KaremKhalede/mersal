import Link from "next/link";
import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getBranchScope } from "@/lib/branch-scope";
import { listBranches } from "@/modules/branches/service";
import { businessToday, type AgingKey } from "@/modules/collections/service";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import { ExportInvoicesButton } from "./export-invoices-button";
import { ReceivablesPanel } from "./receivables-panel";
import { PlatformFeesPanel } from "./platform-fees-panel";
import { DailyClosePanel } from "./daily-close-panel";

/**
 * ============================================================================================
 * المالية — one destination, three questions.
 * ============================================================================================
 *
 * This page used to be one thing: the platform's invoices. That is the money the company OWES,
 * settled once a month. The money the company is OWED — collected dozens of times a day, at a
 * counter, in cash — had no screen at all: it was a single figure on the dashboard linking to a
 * checkbox filter on the shipments list. The two were not mixed; one was simply missing.
 *
 * So the page now answers three questions, in the order a manager asks them:
 *
 *   المستحقات على العملاء  (default)  من عليه، ومنذ متى؟          -> receivables-panel.tsx
 *   إقفال اليوم                       من قبض اليوم، وهل يطابق؟     -> daily-close-panel.tsx
 *   رسوم المنصة                       كم علينا للمنصة؟            -> platform-fees-panel.tsx
 *
 * Receivables leads because it is the question asked most often and the one with no other home.
 * Platform fees keep every byte of their previous behaviour, moved not rewritten.
 *
 * ## The separation, enforced by construction
 *
 * CUSTOMER money and PLATFORM money never appear in the same panel, never share a figure, and are
 * read by two modules that do not import each other (modules/collections vs modules/billing). A
 * tab boundary is a stronger fence than a heading: no card on this page can accidentally sum
 * across the two, because no rendered component has both numbers in scope.
 *
 * ## Why URL-driven tabs instead of the Radix <Tabs> used elsewhere
 *
 * Radix Tabs hold their state on the client, which means every tab's data must be fetched and sent
 * on every visit. Each of these three panels runs its own set of database reads; two thirds of that
 * work would be thrown away on each page load, on a page a manager opens all day. Keying off the
 * URL means only the active panel is rendered at all — and it makes each tab linkable, which is
 * what lets the dashboard's three finance figures land directly on the panel that explains them.
 */

const TABS = [
  { key: "receivables", label: "المستحقات على العملاء", description: "ما لك على عملاء الشحن — من عليه، ومنذ متى" },
  { key: "close", label: "إقفال اليوم", description: "من قبض اليوم، وكم يجب أن يكون في الصندوق" },
  { key: "platform", label: "رسوم المنصة", description: "ما على الشركة للمنصة — الفواتير والمدفوعات" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const AGING_KEYS: AgingKey[] = ["0-7", "8-14", "15-30", "30+"];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; invoice?: string; limit?: string; branchId?: string; aging?: string; date?: string }>;
}) {
  const user = await requireCompanyUser();
  // Unchanged gate. Customer receivables are as sensitive as platform invoices and answer to the
  // same permission — this program adds screens, never a new permission or a new way in.
  requireCan(user, "billing", "view");

  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "receivables";
  const active = TABS.find((t) => t.key === tab)!;
  const branchScope = getBranchScope(user);

  // Only fetched for the tab that offers a branch filter, and only for a role that can widen its
  // own view — a branch-scoped employee has nothing to choose between.
  const branches = tab === "receivables" && !branchScope ? await listBranches(user.companyId!) : [];

  // Validated against the known keys rather than passed through: an arbitrary ?aging= value would
  // otherwise silently match nothing and render an empty screen that looks like "no debt".
  const aging = AGING_KEYS.includes(sp.aging as AgingKey) ? (sp.aging as AgingKey) : undefined;
  // Same for the date: a malformed ?date= must fall back to today, not to an empty day.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : businessToday();

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          title="المالية"
          description={active.description}
          actions={tab === "platform" ? <ExportInvoicesButton /> : undefined}
        />
      </div>

      <BillingTabs active={tab} />

      {tab === "receivables" && (
        <ReceivablesPanel
          companyId={user.companyId!}
          branchScope={branchScope}
          branchId={sp.branchId}
          aging={aging}
          branches={branches}
        />
      )}
      {tab === "close" && <DailyClosePanel companyId={user.companyId!} branchScope={branchScope} day={day} />}
      {tab === "platform" && <PlatformFeesPanel companyId={user.companyId!} invoiceId={sp.invoice} limit={sp.limit} />}
    </div>
  );
}

/**
 * Links dressed as tabs — deliberately not the Radix TabsList, which would need a client component
 * to drive navigation and would then be a tab bar that is neither a real tab widget (its panels
 * live on other requests) nor a real nav. These are anchors: middle-click opens a tab, the browser
 * back button steps between them, and a screen reader announces them as what they are.
 *
 * The active underline is the same `after:` treatment TabsTrigger's `line` variant uses, so the
 * three financial views read as the same control the shipment page already taught.
 */
function BillingTabs({ active }: { active: TabKey }) {
  return (
    <nav aria-label="أقسام المالية" className="-mb-px flex gap-1 overflow-x-auto border-b print:hidden">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={`/app/billing?tab=${t.key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
              "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground after:opacity-0",
              isActive ? "text-foreground after:opacity-100" : "text-foreground/60 hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
