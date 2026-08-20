import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one layout every empty / error / not-found screen in the product uses.
 *
 * Kept as a shared shell rather than a handful of similar-looking pages so that a 404 in the
 * platform console, a failed load in the driver app and a missing shipment on the public tracking
 * page all read as the same product: same icon treatment, same type scale, same spacing, same
 * button shapes, same RTL behaviour. Only the words and the destination change.
 */
export function StateShell({
  icon: Icon,
  tone = "muted",
  title,
  description,
  children,
  compact,
}: {
  icon: LucideIcon;
  tone?: "muted" | "destructive" | "warning";
  title: string;
  description: string;
  children?: React.ReactNode;
  /** For the driver app and other narrow columns, where the full-height version wastes the screen. */
  compact?: boolean;
}) {
  const toneClasses = {
    muted: "bg-muted text-muted-foreground",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/15 text-warning",
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 text-center",
        compact ? "py-10" : "min-h-[60vh] py-12"
      )}
    >
      <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl", toneClasses)}>
        <Icon className="h-7 w-7" />
      </span>
      <h1 className="mt-4 text-lg font-bold sm:text-xl">{title}</h1>
      {/* max-w keeps Arabic wrapping to a comfortable measure instead of one long line on desktop. */}
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * "Back to X" link, styled as a button so it sits alongside the retry action.
 * ChevronRight (not Left) is the RTL-correct "back" direction — the same one the detail pages use.
 */
export function BackButton({
  href,
  label,
  variant = "outline",
}: {
  href: string;
  label: string;
  variant?: "outline" | "default";
}) {
  return (
    <Button asChild variant={variant}>
      <Link href={href}>
        <ChevronRight className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
