import Link from"next/link";
import { requireCompanyUser } from"@/lib/auth";
import { can } from"@/lib/rbac";
import type { PermissionResource } from"@/lib/enums";
import { Button } from"@/components/ui/button";
import {
  Settings,
  ShieldCheck,
  Users,
  Building2,
  Car,
  Bell,
  ChevronLeft,
} from"lucide-react";
import { PageHeader } from"@/components/shell/page-header";

type SettingsCard = {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Tint classes for the icon tile, from the product's own tone tokens.
   *
   * This was the only page in Chargee painting with raw Tailwind palette colours — blue-50,
   * emerald-50, violet-50, orange-50, sky-50, slate-100, six hues on one screen, plus hand-written
   * `dark:` variants for a theme that is never mounted. Every other surface draws from
   * primary/success/warning/muted, where a colour means one thing consistently. Six decorative hues
   * made the settings hub read as a different product from the pages it links to.
   */
  tone: string;
  /** Omitted for destinations the sidebar also leaves ungated (notifications). */
  resource?: PermissionResource;
};

/** Order is the RTL reading order: the first card renders top-right, the last bottom-left. */
const CARDS: SettingsCard[] = [
  {
    href:"/app/branches",
    title:"الفروع",
    description:"إدارة فروع الشركة، عناوينها ومعلومات التواصل لكل فرع.",
    cta:"إدارة الفروع",
    icon: Building2,
    tone:"bg-primary/10 text-primary",
    resource:"branches",
  },
  {
    href:"/app/employees",
    title:"الموظفين",
    description:"إدارة بيانات الموظفين، الحسابات، الأدوار وحالة الوصول للنظام.",
    cta:"إدارة الموظفين",
    icon: Users,
    tone:"bg-success/15 text-success",
    resource:"employees",
  },
  {
    href:"/app/roles",
    title:"الصلاحيات",
    description:"إدارة الأدوار والصلاحيات والتحكم في وصول المستخدمين للنظام.",
    cta:"إدارة الصلاحيات",
    icon: ShieldCheck,
    tone:"bg-primary/10 text-primary",
    resource:"roles",
  },
  {
    href:"/app/notifications",
    title:"الإشعارات",
    description:"إدارة إعدادات الإشعارات والبريد الإلكتروني والتنبيهات داخل النظام.",
    cta:"إدارة الإشعارات",
    icon: Bell,
    tone:"bg-warning/15 text-warning",
  },
  {
    href:"/app/vehicles",
    title:"المركبات",
    description:"إدارة المركبات، بياناتها، حالتها وتخصيصها للرحلات.",
    cta:"إدارة المركبات",
    icon: Car,
    tone:"bg-primary/10 text-primary",
    resource:"vehicles",
  },
  {
    href:"/app/settings/company",
    title:"إعدادات الشركة",
    description:"إعدادات عامة تتعلق بالشركة مثل اللغة، المنطقة الزمنية، العملة وغيرها.",
    cta:"إعدادات الشركة",
    icon: Settings,
    tone:"bg-muted text-muted-foreground",
    resource:"settings",
  },
];

export default async function SettingsPage() {
  const user = await requireCompanyUser();

  // Deliberately not gated on settings.view: this hub is the only nav route to branches, employees,
  // roles and vehicles now that they've left the sidebar, so a settings.view gate would strand a
  // role that can view those but not settings. Nothing here is sensitive — it's a list of links,
  // filtered to what the role may actually open, and every destination guards itself on entry.
  const cards = CARDS.filter(
    (c) => !c.resource || can(user, c.resource,"view") || can(user, c.resource,"manage")
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="الإعدادات"
        description="إدارة إعدادات الشركة وكل ما يتعلق بالنظام من مكان واحد."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group flex flex-col rounded-xl border bg-card p-4 text-center shadow-sm transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100 ${card.tone}`}
            >
              <card.icon className="h-7 w-7" />
            </span>

            <h2 className="mt-5 text-base font-bold text-foreground">{card.title}</h2>
            <p className="mt-2 mb-6 text-sm leading-relaxed text-muted-foreground">
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

    </div>
  );
}
