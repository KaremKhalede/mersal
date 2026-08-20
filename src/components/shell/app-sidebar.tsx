"use client";

import { useSyncExternalStore } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarContent, type NavItem } from "./sidebar";

const STORAGE_KEY = "chargee:sidebar-collapsed";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}
function getServerSnapshot() {
  return false;
}

/** Desktop sidebar with a collapsible icon-only mode — preference remembered across visits via
 * localStorage. Reads through useSyncExternalStore (not a mount effect + setState, which the
 * mobile drawer's own comment already flags as a cascading-render trap) so toggling stays a plain
 * synchronous read with no flash of the wrong width. Mobile always uses the full drawer
 * (MobileSidebar); this component renders nothing below `md`. */
export function AppSidebar({
  brand,
  subBrand,
  items,
  tone,
}: {
  brand: string;
  subBrand?: string;
  items: NavItem[];
  tone?: "company" | "platform";
}) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
    // The native "storage" event only fires in *other* tabs — dispatch one locally so this tab's
    // useSyncExternalStore re-reads immediately too.
    window.dispatchEvent(new StorageEvent("storage"));
  }

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 flex-col border-e border-sidebar-border print:hidden transition-[width] duration-150",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <SidebarContent
        brand={brand}
        subBrand={subBrand}
        items={items}
        tone={tone}
        collapsed={collapsed}
        footer={
          <button
            type="button"
            onClick={toggle}
            className={cn(
              "flex items-center gap-2.5 border-t border-sidebar-border px-2.5 py-2.5 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              collapsed && "justify-center"
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4 shrink-0" /> : <PanelLeftClose className="h-4 w-4 shrink-0" />}
            {!collapsed && "طي القائمة"}
          </button>
        }
      />
    </aside>
  );
}
