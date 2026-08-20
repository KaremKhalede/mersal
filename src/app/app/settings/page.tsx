import Link from "next/link";
import { requireCompanyUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import type { PermissionResource } from "@/lib/enums";
import { Button } from "@/components/ui/button";
import {
  Settings,
  ShieldCheck,
  Users,
  Building2,
  Car,
  Bell,
  ChevronLeft,
  Info,
} from "lucide-react";

type SettingsCard = {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tint classes for the icon tile — one hue per category, kept distinct from the brand accent. */
  tone: string;
  /** Omitted for destinations the sidebar also leaves ungated (notifications). */
  resource?: PermissionResource;
};

/** Order is the RTL reading order: the first card renders top-right, the last bottom-left. */
const CARDS: SettingsCard[] = [
  {
    href: "/app/branches",
    title: "الفروع",
    description: "إدارة فروع الشركة، عناوينها ومعلومات التواصل لكل فرع.",
    cta: "إدارة الفروع",
    icon: Building2,
    tone: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    resource: "branches",
  },
  {
    href: "/app/employees",
    title: "الموظفين",
    description: "إدارة بيانات الموظفين، الحسابات، الأدوار وحالة الوصول للنظام.",
    cta: "إدارة الموظفين",
    icon: Users,
    tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    resource: "employees",
  },
  {
    href: "/app/roles",
    title: "الصلاحيات",
    description: "إدارة الأدوار والصلاحيات والتحكم في وصول المستخدمين للنظام.",
    cta: "إدارة الصلاحيات",
    icon: ShieldCheck,
    tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    resource: "roles",
  },
  {
    href: "/app/notifications",
    title: "الإشعارات",
    description: "إدارة إعدادات الإشعارات والبريد الإلكتروني والتنبيهات داخل النظام.",
    cta: "إدارة الإشعارات",
    icon: Bell,
    tone: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
  },
  {
    href: "/app/vehicles",
    title: "المركبات",
    description: "إدارة المركبات، بياناتها، حالتها وتخصيصها للرحلات.",
    cta: "إدارة المركبات",
    icon: Car,
    tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400",
    resource: "vehicles",
  },
  {
    href: "/app/settings/company",
    title: "إعدادات الشركة",
    description: "إعدادات عامة تتعلق بالشركة مثل اللغة، المنطقة الزمنية، العملة وغيرها.",
    cta: "إعدادات الشركة",
    icon: Settings,
    tone: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    resource: "settings",
  },
];

export default async function SettingsPage() {
  const user = await requireCompanyUser();

  // Deliberately not gated on settings.view: this hub is the only nav route to branches, employees,
  // roles and vehicles now that they've left the sidebar, so a settings.view gate would strand a
  // role that can view those but not settings. Nothing here is sensitive — it's a list of links,
  // filtered to what the role may actually open, and every destination guards itself on entry.
  const cards = CARDS.filter(
    (c) => !c.resource || can(user, c.resource, "view") || can(user, c.resource, "manage")
  );

  return (
    <div className="space-y-5">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/app" className="hover:text-foreground">الرئيسية</Link>
        <ChevronLeft className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">الإعدادات</span>
      </nav>

      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="h-6 w-6 text-muted-foreground" />
          الإعدادات
        </h1>
        <p className="text-sm text-muted-foreground">
          إدارة إعدادات الشركة وكل ما يتعلق بالنظام من مكان واحد.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <Link
            key={card.href}
            href={card.href}
            style={{ animationDelay: `${i * 60}ms` }}
            className="group flex animate-in flex-col rounded-xl border bg-card p-6 text-center shadow-sm fade-in slide-in-from-bottom-3 duration-500 transition-all [animation-fill-mode:backwards] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:animate-none motion-reduce:hover:translate-y-0"
          >
            <span
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100 ${card.tone}`}
            >
              <card.icon className="h-7 w-7" />
            </span>

            <h2 className="mt-5 text-base font-bold text-foreground">{card.title}</h2>
            <p className="mt-2 mb-6 text-[13px] leading-relaxed text-muted-foreground">
              {card.description}
            </p>

            <Button
              variant="outline"
              tabIndex={-1}
              aria-hidden="true"
              className="mt-auto h-10 w-full justify-center font-semibold group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:text-primary"
              asChild
            >
              <span>
                {card.cta}
                <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
              </span>
            </Button>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 text-center text-[13px] font-medium text-primary">
        <Info className="h-4 w-4 shrink-0" />
        جميع الإعدادات تقوم على مستوى الشركة، ويتم تطبيقها على جميع الفروع والمستخدمين.
      </div>
    </div>
  );
}
