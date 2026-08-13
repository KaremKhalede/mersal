"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SidebarContent, type NavItem } from "./sidebar";

/** Hamburger + drawer replacement for the desktop sidebar below the `md` breakpoint, where
 * AppSidebar renders nothing at all — without this, company/platform admin is unreachable on a
 * phone once you're past the first page you landed on. `side="right"` matches the desktop
 * sidebar's visual position (its `border-e` puts it at the RTL inline-start, i.e. the physical
 * right edge). Closes on any nav-link click via event delegation (not a pathname effect, which
 * would cause a synchronous setState-in-effect cascade) so navigating never leaves a stale
 * overlay blocking the page underneath. */
export function MobileSidebar({ brand, subBrand, items }: { brand: string; subBrand?: string; items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden shrink-0"
        aria-label="فتح القائمة"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <SheetContent
        side="right"
        className="w-64 p-0 border-sidebar-border"
        onClickCapture={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
        <SidebarContent brand={brand} subBrand={subBrand} items={items} />
      </SheetContent>
    </Sheet>
  );
}
