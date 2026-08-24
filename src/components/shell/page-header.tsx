import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one page header in the product.
 *
 * It replaced five: a bare `<h2>`, an `<h2>` behind a 40px icon tile, an `<h2>` with an inline
 * icon, an `<h1 tracking-tight>` with a description, and a bare `<h1>` — plus `h1`/`h2` chosen at
 * random across 44 pages, twelve of which had no `h1` at all.
 *
 * ## Where the trail lives
 *
 * The parent link sits *on the title line*, not on a row of its own:
 *
 *     الشحنات ‹ SH-10482  [في الطريق]
 *
 * The alternative — a breadcrumb row ending in the record, with the record repeated as the heading
 * underneath — is the common shape elsewhere, and it works there because the crumb carries an id
 * and the heading carries a human name (`ENG-123` / "Fix the memory leak"). In Chargee the record's
 * identity *is* its title: a shipment is its number, a vehicle is its plate, a customer is their
 * name. So the two segments were byte-identical on 10 of 10 detail pages, and the fix could not be
 * "put something else in the heading" — the shipment number is what staff read out on the phone and
 * write on the carton, so it has to stay the largest thing on the page.
 *
 * `parent` is one link, never a chain. After dropping "الرئيسية" — a crumb that restates what the
 * always-visible sidebar already highlights — no route in the product is deeper than parent +
 * record, so every detail page is exactly two segments. A future four-level route would need this
 * revisited; there isn't one, so there is no array here pretending to handle it.
 *
 * ChevronLeft, not Right: leftward is the forward direction in RTL, so the parent sits on the
 * reading start (right) and the eye travels الشحنات → SH-10482. (ChevronRight is "back" — see
 * BackButton in components/feedback/state-shell.tsx.)
 *
 * Two variants, and only two:
 *   `page`   — a section or list ("الشحنات", "التقارير").
 *   `record` — one identified thing whose number *is* the title ("SH-10482", "TR-2045").
 *
 * Deliberately absent:
 *   - The icon tile. The sidebar already highlights the section with the same icon; repeating it
 *     here spent ~48px of vertical space restating where you already are.
 *   - `tracking-tight`. Negative letter-spacing is a Latin display trick. Arabic is a connected
 *     script — tightening crowds the joins instead of tightening the line.
 */
export function PageHeader({
  title,
  count,
  badge,
  description,
  parent,
  actions,
  variant = "page",
}: {
  title: string;
  /** Renders as "الشحنات (128)" — the existing convention on the list pages. */
  count?: number;
  /** Status chip that belongs to the title itself, not to the page (shipment status, trip status). */
  badge?: React.ReactNode;
  description?: string;
  /** The section this page hangs off. Omit on top-level pages — the sidebar is the trail there. */
  parent?: { label: string; href: string };
  actions?: React.ReactNode;
  variant?: "page" | "record";
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {parent && (
            <>
              <Link href={parent.href} className="text-sm text-muted-foreground hover:text-foreground">
                {parent.label}
              </Link>
              <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </>
          )}
          <h1 className={cn("font-bold", variant === "record" ? "text-2xl" : "text-xl")}>
            {title}
            {count !== undefined && ` (${count.toLocaleString("en-US")})`}
          </h1>
          {badge}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  );
}
