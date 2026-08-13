import { requireCompanyUser } from "@/lib/auth";
import { AppSidebar, type NavItem } from "@/components/shell/sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { can } from "@/lib/rbac";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCompanyUser();

  const allItems: (NavItem & { resource?: Parameters<typeof can>[1] })[] = [
    { href: "/app", label: "لوحة التحكم", icon: "LayoutDashboard", group: "الرئيسية" },

    { href: "/app/shipments", label: "الشحنات", icon: "Package", resource: "shipments", group: "العمليات" },
    { href: "/app/trips", label: "الرحلات", icon: "Truck", resource: "trips", group: "العمليات" },
    { href: "/app/delivery", label: "طلبات التوصيل", icon: "Send", resource: "shipments", group: "العمليات" },
    { href: "/app/exceptions", label: "الاستثناءات", icon: "AlertTriangle", resource: "shipments", group: "العمليات" },
    { href: "/app/customs", label: "الجمارك", icon: "FileText", resource: "customs", group: "العمليات" },

    { href: "/app/branches", label: "الفروع", icon: "Building2", resource: "branches", group: "الإدارة" },
    { href: "/app/customers", label: "العملاء", icon: "Contact", resource: "customers", group: "الإدارة" },
    { href: "/app/employees", label: "الموظفون", icon: "Users", resource: "employees", group: "الإدارة" },
    { href: "/app/vehicles", label: "المركبات", icon: "Car", resource: "vehicles", group: "الإدارة" },
    { href: "/app/roles", label: "الأدوار والصلاحيات", icon: "ShieldCheck", resource: "roles", group: "الإدارة" },
    { href: "/app/documents", label: "المستندات", icon: "FileText", resource: "documents", group: "الإدارة" },

    { href: "/app/billing", label: "المالية", icon: "Wallet", resource: "billing", group: "المالية" },
    { href: "/app/reports", label: "التقارير", icon: "BarChart3", resource: "reports", group: "المالية" },

    { href: "/app/notifications", label: "الإشعارات", icon: "Bell", group: "النظام" },
    { href: "/app/activity", label: "سجل النشاطات", icon: "History", resource: "reports", group: "النظام" },
    { href: "/app/settings", label: "الإعدادات", icon: "Settings", resource: "settings", group: "النظام" },
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
          mobileNav={<MobileSidebar brand={user.company!.name} subBrand={user.branch?.name ?? "كل الفروع"} items={items} />}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6 print:overflow-visible print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  );
}
