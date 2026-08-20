import { requireCompanyUser } from "@/lib/auth";
import { type NavItem } from "@/components/shell/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCompanyUser();
  // Same "needs attention" predicate as the notifications center itself (FAILED or SKIPPED sends).
  const notificationsCount = await prisma.notificationLog.count({
    where: { companyId: user.companyId!, status: { in: ["FAILED", "SKIPPED"] } },
  });

  const allItems: (NavItem & { resource?: Parameters<typeof can>[1] })[] = [
    { href: "/app", label: "لوحة التحكم", icon: "LayoutDashboard", group: "الرئيسية" },

    { href: "/app/shipments", label: "الشحنات", icon: "Package", resource: "shipments", group: "العمليات" },
    { href: "/app/trips", label: "الرحلات", icon: "Truck", resource: "trips", group: "العمليات" },
    { href: "/app/delivery", label: "طلبات التوصيل", icon: "Send", resource: "shipments", group: "العمليات" },

    // الفروع / الموظفون / الصلاحيات / المركبات / الإشعارات moved into the settings hub
    // (src/app/app/settings/page.tsx) — rarely-used admin destinations, reached from there instead.
    { href: "/app/customers", label: "العملاء", icon: "Contact", resource: "customers", group: "الإدارة" },
    { href: "/app/documents", label: "المستندات", icon: "FileText", resource: "documents", group: "الإدارة" },

    { href: "/app/billing", label: "المالية", icon: "Wallet", resource: "billing", group: "المالية" },
    { href: "/app/reports", label: "التقارير", icon: "BarChart3", resource: "reports", group: "المالية" },

    // Intentionally ungated: the hub is now the only nav route to branches/employees/roles/vehicles,
    // so gating it on settings.view would strand a role that can view those but not settings. The
    // hub renders only the cards a role may actually open, and every destination guards itself.
    { href: "/app/settings", label: "الإعدادات", icon: "Settings", group: "النظام" },
  ];

  const items = allItems.filter((i) => !i.resource || can(user, i.resource, "view") || can(user, i.resource, "manage"));

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar brand={user.company!.name} subBrand={user.branch?.name ?? "كل الفروع"} items={items} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={user.company!.name}
          userName={user.name}
          userSubtitle={user.role?.name}
          searchAction="/app/search"
          notificationsHref="/app/notifications"
          notificationsCount={notificationsCount}
          mobileNav={<MobileSidebar brand={user.company!.name} subBrand={user.branch?.name ?? "كل الفروع"} items={items} />}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6 print:overflow-visible print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  );
}
