import { cn } from "@/lib/utils";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";

export type StatTone = "primary" | "success" | "warning" | "destructive";

const TONE_CLASSES: Record<StatTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

/**
 * The one figure card in the product.
 *
 * It replaced seven near-identical implementations: this component's two variants, plus MetricCard
 * (platform dashboard), KpiCard (platform billing — a byte-for-byte copy of MetricCard), StatChip
 * (platform companies), QuickStat (company detail), Stat (trip manifest) and StatMini (trip wizard).
 * Each had drifted a little from the others, and none could be fixed without fixing six more.
 *
 * The shape is MetricCard's, not the old default's, for one reason: it carries `unit` and `footer`
 * without getting taller. A figure whose meaning depends on its unit ("3,756 كرتون", "187,800 ر.ي")
 * or on a comparison ("+12% عن الشهر الماضي") had nowhere to put either, so the platform screens
 * grew their own card and the company screens went without.
 *
 * Density comes from the props, not from a variant: the company dashboard passes label/value/icon
 * and gets a compact card; the platform dashboard adds unit and a delta footer and gets a denser
 * one. Same rhythm, same type scale, same icon placement — different amount of information.
 *
 * `StatCardsSkeleton` (components/feedback/skeletons.tsx) already draws exactly this layout, so a
 * loading page and the page that replaces it line up without a jump.
 */
export function StatCard({
  label,
  value,
  unit,
  icon: Icon,
  tone = "primary",
  footer,
  href,
  linkLabel,
}: {
  label: string;
  value: string | number;
  /** The word after the number — "شركة", "ر.ي", "كرتون". Kept out of `value` so the number stays a number. */
  unit?: string;
  icon: LucideIcon;
  tone?: StatTone;
  /** A delta, a share, or a one-line hint. Sits under the figure, inside the card. */
  footer?: React.ReactNode;
  /** Turns the card's bottom edge into a link strip. Independent of `footer`. */
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {/* tabular-nums so a column of these does not jitter as the digits change. */}
          <p className="mt-1 text-2xl font-bold leading-none tabular-nums">
            {typeof value === "number" ? value.toLocaleString("en-US") : value}
          </p>
          {unit && <p className="mt-1 text-2xs text-muted-foreground">{unit}</p>}
          {footer && <div className="mt-3">{footer}</div>}
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {href && (
        <Link
          href={href}
          className="mt-auto flex items-center gap-1 border-t px-4 py-2 text-xs font-medium text-primary hover:bg-accent"
        >
          {linkLabel ?? "عرض التفاصيل"} <ChevronLeft className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
