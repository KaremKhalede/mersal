import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform } from "@/lib/rbac";
import { platformDashboard } from "@/modules/companies/service";
import { DonutChart } from "@/components/charts/donut-chart";
import { AreaChart } from "@/components/charts/area-chart";
import { MonthPicker } from "@/components/platform/month-picker";
import { monthOptions, monthValue, parseMonth } from "@/components/platform/month-options";
import {
  Users,
  Building2,
  FileText,
  Package,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  AlertCircle,
  Receipt,
  PauseCircle,
} from "lucide-react";

function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <p className="text-[11px] text-muted-foreground">لا توجد بيانات للمقارنة</p>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-[11px] font-medium ${up ? "text-success" : "text-destructive"}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="tabular-nums">{up ? "+" : ""}{value}%</span>
      <span className="text-muted-foreground">{suffix}</span>
    </p>
  );
}

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
  tone,
  footer,
  delay,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  footer: React.ReactNode;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="animate-in rounded-xl border bg-card p-4 shadow-sm fade-in slide-in-from-bottom-3 duration-500 transition-all [animation-fill-mode:backwards] hover:-translate-y-0.5 hover:shadow-md motion-reduce:animate-none motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{unit}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3">{footer}</div>
    </div>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      {children}
      <ChevronLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
    </Link>
  );
}

export default async function PlatformDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "dashboard", "view");
  const { month: rawMonth } = await searchParams;

  const now = new Date();
  const months = monthOptions(now);
  const selected = parseMonth(rawMonth, new Date(now.getFullYear(), now.getMonth(), 1));
  const selectedValue = monthValue(selected);

  const data = await platformDashboard(selected);

  const statusSlices = [
    { label: "نشطة", value: data.activeCompanies, color: "var(--color-success)" },
    { label: "متوقفة", value: data.suspendedCompanies, color: "var(--color-warning)" },
  ];

  const alerts = [
    {
      key: "dormant",
      label: "شركات لم تستخدم النظام منذ 7 أيام",
      count: data.dormantCompanies,
      href: "/platform/companies",
      icon: AlertCircle,
      tone: "bg-destructive/10 text-destructive",
    },
    {
      key: "unpaid",
      label: "فواتير مستحقة الدفع",
      count: data.unpaidInvoices,
      href: "/platform/billing",
      icon: Receipt,
      tone: "bg-warning/15 text-warning",
    },
    {
      key: "suspended",
      label: "شركات متوقفة حالياً",
      count: data.suspendedCompanies,
      href: "/platform/companies",
      icon: PauseCircle,
      tone: "bg-primary/10 text-primary",
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على المنصة</p>
        </div>
        <MonthPicker months={months} value={selectedValue} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="إجمالي الشركات"
          value={data.totalCompanies.toLocaleString("en-US")}
          unit="شركة"
          icon={Users}
          tone="bg-primary/10 text-primary"
          delay={0}
          footer={<p className="text-[11px] text-muted-foreground">منذ بداية المنصة</p>}
        />
        <MetricCard
          label="الشركات النشطة"
          value={data.activeCompanies.toLocaleString("en-US")}
          unit="شركة"
          icon={Building2}
          tone="bg-warning/15 text-warning"
          delay={60}
          footer={
            <p className="text-[11px] font-medium text-primary">
              <span className="tabular-nums">{data.activeShare}%</span>{" "}
              <span className="text-muted-foreground">من إجمالي الشركات</span>
            </p>
          }
        />
        <MetricCard
          label="إيرادات هذا الشهر"
          value={data.revenue.toLocaleString("en-US")}
          unit="ر.ي"
          icon={FileText}
          tone="bg-primary/10 text-primary"
          delay={120}
          footer={<Delta value={data.revenueChange} suffix="عن الشهر الماضي" />}
        />
        <MetricCard
          label="الكراتين هذا الشهر"
          value={data.cartonsThisMonth.toLocaleString("en-US")}
          unit="كرتون"
          icon={Package}
          tone="bg-success/15 text-success"
          delay={180}
          footer={<Delta value={data.cartonsChange} suffix="عن الشهر الماضي" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="animate-in rounded-xl border bg-card p-5 shadow-sm fade-in slide-in-from-bottom-3 duration-500 [animation-fill-mode:backwards] motion-reduce:animate-none" style={{ animationDelay: "240ms" }}>
          <h2 className="mb-4 text-sm font-bold">حالة الشركات</h2>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <DonutChart slices={statusSlices} total={data.totalCompanies} caption="إجمالي الشركات" />
            <ul className="min-w-36 space-y-2.5">
              {statusSlices.map((s) => (
                <li key={s.label} className="flex items-center justify-between gap-6 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-muted-foreground">{s.label}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{s.value.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-5 border-t pt-3">
            <PanelLink href="/platform/companies">عرض جميع الشركات</PanelLink>
          </div>
        </section>

        <section className="animate-in rounded-xl border bg-card p-5 shadow-sm fade-in slide-in-from-bottom-3 duration-500 [animation-fill-mode:backwards] motion-reduce:animate-none" style={{ animationDelay: "300ms" }}>
          <h2 className="mb-4 text-sm font-bold">استخدام الكراتين</h2>
          <AreaChart series={data.series} labelCurrent="الحالي" labelPrevious="الشهر الماضي" />
          <div className="mt-5 border-t pt-3">
            <PanelLink href="/platform/billing">عرض تقرير الاستخدام</PanelLink>
          </div>
        </section>
      </div>

      <section className="animate-in rounded-xl border bg-card p-5 shadow-sm fade-in slide-in-from-bottom-3 duration-500 [animation-fill-mode:backwards] motion-reduce:animate-none" style={{ animationDelay: "360ms" }}>
        <h2 className="mb-4 text-sm font-bold">تنبيهات مهمة</h2>
        <ul className="space-y-2.5">
          {alerts.map((a) => (
            <li key={a.key}>
              <Link
                href={a.href}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.tone}`}>
                  <a.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm">{a.label}</span>
                <span className="text-sm font-bold tabular-nums text-muted-foreground">{a.count}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t pt-3">
          <PanelLink href="/platform/companies">عرض جميع التنبيهات</PanelLink>
        </div>
      </section>
    </div>
  );
}
