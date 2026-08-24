import Link from "next/link";
import { SearchX, type LucideIcon } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { StateShell } from "./state-shell";

/**
 * Empty screens, in two kinds — because they ask for two different actions.
 *
 * The product had 31 different empty messages, 17 of them a bare grey line in a `colSpan` cell, and
 * not one of them distinguished "you have no data yet" from "your filter matched nothing". Those
 * are not the same screen: the first wants a create button, the second wants the filter cleared.
 * Saying "لا توجد نتائج" to someone who has never created a shipment is a dead end; offering
 * "أضف أول شحنة" to someone who just typed a search is worse.
 *
 * Built on StateShell, which already defines the icon/type/spacing treatment used by every
 * error.tsx and not-found.tsx — so a blank table and a 404 read as the same product.
 *
 * Scope: primary list pages only. A sub-table inside a record — the employees at a branch, the
 * shipments on an invoice, the recent rows on a dashboard — keeps its one plain line. Empty there
 * is a fact about the record being viewed, not a task the user came to start, and a full-height
 * illustrated panel inside a card would shout it.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The create button. Omit only when the role genuinely cannot create. */
  action?: React.ReactNode;
}) {
  return (
    <StateShell compact icon={icon} title={title} description={description}>
      {action}
    </StateShell>
  );
}

/**
 * "Your filter matched nothing." One line and a way out — no icon, no illustration, because the
 * user is mid-task and the screen is about to change again as soon as they retype.
 */
export function NoResults({ resetHref, label = "لا توجد نتائج مطابقة" }: { resetHref: string; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <SearchX className="h-5 w-5" />
      <p>{label}</p>
      <Link href={resetHref} className="font-medium text-primary hover:underline">
        مسح الفلاتر
      </Link>
    </div>
  );
}

/** Either of the above, parked in a table body so the table keeps its own borders and width. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="p-0">
        {children}
      </TableCell>
    </TableRow>
  );
}
