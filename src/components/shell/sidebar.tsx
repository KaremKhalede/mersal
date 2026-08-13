import { Package } from "lucide-react";
import { SidebarNavLink } from "./nav-link";
import type { IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; group?: string };

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
 * so the two never drift out of sync — one source of truth for what's in the sidebar. */
export function SidebarContent({ brand, subBrand, items }: { brand: string; subBrand?: string; items: NavItem[] }) {
  const sections = groupItems(items);
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Package className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-sm">{brand}</p>
          {subBrand && <p className="truncate text-xs text-sidebar-foreground/60">{subBrand}</p>}
        </div>
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {sections.map((section, i) => (
          <div key={section.group ?? i} className="space-y-0.5">
            {section.group && (
              <p className="px-2 text-xs font-medium text-sidebar-foreground/50">{section.group}</p>
            )}
            {section.items.map((item) => (
              <SidebarNavLink key={item.href} {...item} />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

export function AppSidebar({ brand, subBrand, items }: { brand: string; subBrand?: string; items: NavItem[] }) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-e border-sidebar-border print:hidden">
      <SidebarContent brand={brand} subBrand={subBrand} items={items} />
    </aside>
  );
}
