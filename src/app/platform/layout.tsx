import { requirePlatformAdmin } from "@/lib/auth";
import { canPlatform } from "@/lib/rbac";
import type { PlatformResource } from "@/lib/enums";
import { type NavItem } from "@/components/shell/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();

  // Platform Admin runs the SaaS itself, not any carrier's daily operations, so the shipment/trip/
  // delivery and general-reports links were dropped from this nav. Their pages, services and data
  // are untouched and still reachable by URL — this is a navigation change only.
  // "الدعم" is intentionally absent until that page exists; linking it now would only 404.
  const allItems: (NavItem & { resource: PlatformResource })[] = [
    // exact: "/platform" is a prefix of every other entry, so without it this item stays highlighted
    // on every child page next to the genuinely active one.
    { href: "/platform", label: "الرئيسية", icon: "LayoutDashboard" as const, exact: true, resource: "dashboard" },

    // Usage is not a separate destination: pricing is usage-based (fee per carton), so usage and
    // collection are two columns of the same question and both live on /platform/billing.
    { href: "/platform/companies", label: "الشركات", icon: "Building2" as const, group: "المنصة", resource: "companies" },
    { href: "/platform/billing", label: "الفوترة", icon: "Wallet" as const, group: "المنصة", resource: "billing" },

    { href: "/platform/users", label: "مستخدمو المنصة", icon: "Users" as const, group: "الإدارة", resource: "platformUsers" },

    // "سجل النشاطات" is out of MVP scope — the AuditLog model and every logAudit() call stay, they
    // just have no platform-side reader. The company-side view (/app/activity) is unaffected.
    { href: "/platform/settings", label: "إعدادات المنصة", icon: "Settings" as const, group: "النظام", resource: "settings" },
  ];

  // The nav shows only what this operator may actually open; every page re-checks server-side, so
  // hiding a link is convenience, never the control.
  const items = allItems.filter((i) => canPlatform(user, i.resource, "view"));

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar brand="منصة الشحن البري" subBrand="لوحة إدارة المنصة" items={items} tone="platform" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title="إدارة المنصة"
          userName={user.name}
          userSubtitle="مدير المنصة"
          mobileNav={<MobileSidebar brand="منصة الشحن البري" subBrand="لوحة إدارة المنصة" items={items} tone="platform" />}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
