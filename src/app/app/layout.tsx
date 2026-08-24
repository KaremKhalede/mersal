import { requireCompanyUser } from "@/lib/auth";
import { type NavItem } from "@/components/shell/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { MobileSidebar } from "@/components/shell/mobile-sidebar";
import { Topbar } from "@/components/shell/topbar";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";

export default async function CompanyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCompanyUser();
  // FAILED only — deliberately narrower than the notifications centre, which still lists SKIPPED
  // alongside it (and already counts the two separately).
  //
  // A badge is a promise that acting on it makes the number go down. FAILED keeps that promise:
  // retryNotification mutates the row in place (FAILED -> PENDING -> SENT), so a successful retry
  // removes it from this count and the bell can genuinely reach zero. SKIPPED cannot: it is not
  // retryable by construction — `if (log.status !== "FAILED") throw` — and fixing the customer's
  // phone number does not touch the historical row. Counting it meant the badge was red on day one
  // and red forever, which is the fastest way to teach people to ignore a badge.
  //
  // SKIPPED is not hidden: it stays on /app/notifications under "متخطاة", where the fix is a data
  // correction rather than a button.
  const notificationsCount = await prisma.notificationLog.count({
    where: { companyId: user.companyId!, status: "FAILED" },
  });

  const allItems: (NavItem & { resource?: Parameters<typeof can>[1] })[] = [
    // exact: "/app" is a prefix of every other entry, so without it this item stays highlighted
    // on every page in the app — same reason the platform sidebar marks its own index route.
    { href: "/app", label: "لوحة التحكم", icon: "LayoutDashboard", exact: true, group: "الرئيسية" },

    { href: "/app/shipments", label: "الشحنات", icon: "Package", resource: "shipments", group: "العمليات" },
    { href: "/app/trips", label: "الرحلات", icon: "Truck", resource: "trips", group: "العمليات" },
    { href: "/app/delivery", label: "طلبات التوصيل", icon: "Send", resource: "shipments", group: "العمليات" },
    // التقارير sat under المالية, which is a miscategorisation rather than a layout choice:
    // periodReport counts shipments, cartons and statuses — operations, not money. Sitting beside
    // the invoices tab implied a financial report it never was.
    //
    // It joins العمليات rather than getting a group of its own: a one-item section whose heading is
    // the item's own label ("التقارير" above "التقارير") is a line of chrome that says nothing, and
    // it is the exact thing this sidebar was pruned to remove.
    { href: "/app/reports", label: "التقارير", icon: "BarChart3", resource: "reports", group: "العمليات" },

    // الفروع / الموظفون / الصلاحيات / المركبات / الإشعارات moved into the settings hub
    // (src/app/app/settings/page.tsx) — rarely-used admin destinations, reached from there instead.
    //
    // المستندات is deliberately NOT here. Every Document row hangs off a shipment (Document.shipmentId)
    // and every upload happens inside the shipment's own المرفقات tab — the page even says so. It is
    // an archive of something else, not a place anyone sets out for, and it was spending one of the
    // sidebar's eight slots on a destination reached by accident. The page still exists at
    // /app/documents, still guards itself, and is now linked from where its contents come from.
    { href: "/app/customers", label: "العملاء", icon: "Contact", resource: "customers", group: "الإدارة" },

    { href: "/app/billing", label: "المالية", icon: "Wallet", resource: "billing", group: "المالية" },

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
        <main className="flex-1 overflow-y-auto bg-muted/30 p-4 lg:p-6 print:overflow-visible print:bg-white print:p-0">{children}</main>
      </div>
    </div>
  );
}
