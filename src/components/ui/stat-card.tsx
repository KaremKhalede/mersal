import { cn } from "@/lib/utils";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import Link from "next/link";

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  href,
  linkLabel,
  variant = "icon-end",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "destructive" | "info";
  /** Optional footer link — omit for the plain card (platform dashboard, etc). */
  href?: string;
  linkLabel?: string;
  /** "icon-end" (default): icon first in DOM, renders on the reading-start side (right in RTL) —
   * every existing StatCard caller. "icon-start": the reports-page look — icon in a soft round
   * badge on the far side, value colored by tone, label beneath it. */
  variant?: "icon-end" | "icon-start";
}) {
  const toneClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    info: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  const valueToneClasses: Record<string, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-violet-600 dark:text-violet-400",
  };

  return (
    <div className="rounded-xl border bg-card flex flex-col">
      {variant === "icon-start" ? (
        <div className="p-4 flex items-center justify-between gap-3">
          <div className="min-w-0 text-right">
            <p className={cn("text-2xl font-bold leading-tight", valueToneClasses[tone])}>{value}</p>
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      ) : (
        <div className="p-4 flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
        </div>
      )}
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
