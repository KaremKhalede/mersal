"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronUp } from "lucide-react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-start align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pe-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * A money / count column, header and cells alike.
 *
 * Numbers were being written as plain cells with `dir="ltr"` on the cell. That is two separate
 * bugs at once: `text-start` inside an LTR cell resolves to *left*, while the Arabic header above
 * it stays right-aligned — so the column header and its own figures sat at opposite edges — and
 * because nothing pinned the digits to a common edge, "40,000" and "120,000" did not line up their
 * units with each other either. A column of money you cannot compare down the page is not a money
 * column.
 *
 * `text-end` puts both the header and every figure on the same edge, which in RTL is the left one,
 * so the digits stack units-over-units. `tabular-nums` keeps the glyph widths fixed so the stack
 * survives a change from 9 to 10. The `dir="ltr"` still belongs on whatever renders the number
 * itself — these only fix where the column sits.
 */
function TableHeadNum({ className, ...props }: React.ComponentProps<"th">) {
  return <TableHead className={cn("text-end", className)} {...props} />
}

function TableCellNum({ className, ...props }: React.ComponentProps<"td">) {
  return <TableCell className={cn("text-end tabular-nums", className)} {...props} />
}

/**
 * A column header that reorders the list — a link, not a button.
 *
 * The order lives in the URL, so a sorted view is linkable, survives a refresh, and steps back
 * with the browser's own back button. A client-side sort control would have to re-implement all
 * three, and would sort only the twenty rows that happen to be on the current page — which is not
 * sorting, it is shuffling a page.
 *
 * `aria-sort` is what actually communicates the state to a screen reader; the caret is decoration
 * and is marked as such. Both directions stay reachable: clicking the active column flips it
 * rather than turning the control off, so a header can never become a dead end.
 */
function TableHeadSort({
  href,
  active,
  direction,
  children,
  className,
  ...props
}: React.ComponentProps<"th"> & {
  href: string
  active: boolean
  /** The direction the list is currently in — not the one this link will apply. */
  direction: "asc" | "desc"
}) {
  return (
    <TableHead
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("p-0", className)}
      {...props}
    >
      <Link
        href={href}
        className="flex h-10 w-full items-center gap-1 px-2 hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {children}
        <ChevronUp
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            active ? "text-primary" : "text-muted-foreground/40",
            active && direction === "desc" && "rotate-180"
          )}
        />
      </Link>
    </TableHead>
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableHeadNum,
  TableHeadSort,
  TableCellNum,
  TableCaption,
}
