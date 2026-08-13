import { requirePlatformAdmin } from "@/lib/auth";
import { AppSidebar } from "@/components/shell/sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Topbar } from "@/components/shell/topbar";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();

  const items = [
    { href: "/platform", label: "لوحة التحكم", icon: "LayoutDashboard" as const, group: "الرئيسية" },

    { href: "/platform/companies", label: "الشركات", icon: "Building2" as const, group: "الشركات" },

    { href: "/platform/shipments", label: "جميع الشحنات", icon: "Package" as const, group: "العمليات" },
    { href: "/platform/trips", label: "الرحلات", icon: "Truck" as const, group: "العمليات" },
    { href: "/platform/delivery", label: "طلبات التوصيل (أرشي)", icon: "Send" as const, group: "العمليات" },

    { href: "/platform/users", label: "المستخدمون", icon: "Users" as const, group: "المستخدمون" },

    { href: "/platform/billing", label: "الفوترة والرسوم", icon: "Wallet" as const, group: "المالية" },
    { href: "/platform/reports", label: "التقارير العامة", icon: "BarChart3" as const, group: "المالية" },

    { href: "/platform/audit", label: "سجلات النظام", icon: "History" as const, group: "النظام" },
    { href: "/platform/settings", label: "إعدادات المنصة", icon: "Settings" as const, group: "النظام" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar brand="منصة الشحن البري" subBrand="لوحة إدارة المنصة" items={items} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title="إدارة المنصة"
          userName={user.name}
          userSubtitle="مدير المنصة"
          mobileNav={<MobileSidebar brand="منصة الشحن البري" subBrand="لوحة إدارة المنصة" items={items} />}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
