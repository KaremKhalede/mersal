import { Package, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SidebarNavLink } from "./nav-link";
import type { IconName } from "./icons";

/** `exact` opts an item out of prefix matching — needed for index routes like "/platform", which
 *  would otherwise stay highlighted on every child page alongside the real active item. */
export type NavItem = { href: string; label: string; icon: IconName; group?: string; exact?: boolean };

/** Groups items by their (optional) `group`, preserving first-seen group order — items without a
 * group render ungrouped at the top, same as before this existed. */
function groupItems(items: NavItem[]): { group?: string; items: NavItem[] }[] {
  const sections: { group?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    let section = sections.find((s) => s.group === item.group);
    if (!section) {
      section = { group: item.group, items: [] };
      sections.push(section);
    }
    section.items.push(item);
  }
  return sections;
}

/** The nav content itself, shared between the desktop `<aside>` and the mobile drawer (MobileSidebar)
 * so the two never drift out of sync — one source of truth for what's in the sidebar. `tone="platform"`
 * gives the platform console a subtly distinct identity (icon + underline) without a second design system. */
export function SidebarContent({
  brand,
  subBrand,
  items,
  tone = "company",
  collapsed,
  footer,
}: {
  brand: string;
  subBrand?: string;
  items: NavItem[];
  tone?: "company" | "platform";
  collapsed?: boolean;
  footer?: React.ReactNode;
}) {
  const sections = groupItems(items);
  const isPlatform = tone === "platform";
  return (
    <div className={cn("flex h-full flex-col bg-sidebar text-sidebar-foreground", isPlatform && "border-t-2 border-t-warning")}>
      <div className={cn("flex items-center gap-2 px-4 py-3 border-b border-sidebar-border", collapsed && "justify-center px-2")}>
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            isPlatform ? "bg-white/10 text-sidebar-foreground ring-1 ring-white/15" : "bg-sidebar-primary text-sidebar-primary-foreground"
          )}
        >
          {isPlatform ? <ShieldCheck className="h-4 w-4" /> : <Package className="h-4 w-4" />}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">{brand}</p>
            {subBrand && <p className="truncate text-xs text-sidebar-foreground/60">{subBrand}</p>}
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <div key={section.group ?? i} className="space-y-0.5">
            {section.group && !collapsed && (
              <p className="px-2 text-xs font-medium text-sidebar-foreground/50">{section.group}</p>
            )}
            {section.items.map((item) => (
              <SidebarNavLink key={item.href} {...item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </nav>
      {footer}
    </div>
  );
}
