import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { PageSizeSelect } from "@/components/ui/pagination-page-size";

function pageNumbers(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - (sorted[i - 1] as number) > 1) result.push("…");
    result.push(p);
  });
  return result;
}

/** One pagination control for every paginated list — reuses Button so hover/focus/active states
 * stay identical to the rest of the app instead of each page hand-rolling its own page links.
 * Truncates with "…" past 7 pages. `total`/`itemsShown` are optional — pass both to render the
 * "showing N of Total" summary line; omit on pages that don't track a total count. Pass `pageSize`
 * to add the "عرض [N]" per-page selector (branches-page convention) — omitted by every caller
 * that doesn't need it, so their layout is unchanged. */
export function Pagination({
  page,
  pageCount,
  buildHref,
  total,
  itemsShown,
  itemLabel = "عنصر",
  pageSize,
  pageSizeOptions = [10, 20, 50],
  pageSizeParam,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
  total?: number;
  itemsShown?: number;
  /** Arabic noun for the summary line, e.g. "شحنة" — defaults to a generic "عنصر" (item). */
  itemLabel?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  /** Query-string key the size selector reads/writes — defaults to "pageSize". */
  pageSizeParam?: string;
}) {
  if (pageCount <= 1 && total == null) return null;

  const summary = total != null && itemsShown != null && (
    <p className="text-xs text-muted-foreground">
      إظهار {itemsShown.toLocaleString()} من {total.toLocaleString()} {itemLabel}
    </p>
  );

  const atFirst = page <= 1;
  const atLast = page >= pageCount;

  const pageButtons = pageCount > 1 && (
    <div className="flex items-center gap-1.5">
      {atFirst ? (
        <Button type="button" variant="outline" size="icon-sm" disabled aria-label="الصفحة السابقة">
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button asChild variant="outline" size="icon-sm">
          <Link href={buildHref(page - 1)} aria-label="الصفحة السابقة"><ChevronRight className="h-4 w-4" /></Link>
        </Button>
      )}
      {pageNumbers(page, pageCount).map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
        ) : (
          <Button key={p} asChild variant={p === page ? "default" : "outline"} size="icon-sm">
            <Link href={buildHref(p)}>{p}</Link>
          </Button>
        )
      )}
      {atLast ? (
        <Button type="button" variant="outline" size="icon-sm" disabled aria-label="الصفحة التالية">
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : (
        <Button asChild variant="outline" size="icon-sm">
          <Link href={buildHref(page + 1)} aria-label="الصفحة التالية"><ChevronLeft className="h-4 w-4" /></Link>
        </Button>
      )}
    </div>
  );

  if (pageSize != null) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageSizeSelect pageSize={pageSize} pageSizeOptions={pageSizeOptions} pageSizeParam={pageSizeParam} />
        <div className="flex-1 flex justify-center">{pageButtons}</div>
        {summary}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {summary}
      {pageButtons}
    </div>
  );
}
