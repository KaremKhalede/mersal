import Link from"next/link";
import { requirePlatformAdmin } from"@/lib/auth";
import { requireCanPlatform } from"@/lib/rbac";
import { platformDashboard } from"@/modules/companies/service";
import { DonutChart } from"@/components/charts/donut-chart";
import { AreaChart } from"@/components/charts/area-chart";
import { MonthPicker } from"@/components/platform/month-picker";
import { monthOptions, monthValue, parseMonth } from"@/components/platform/month-options";
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
} from"lucide-react";
import { StatCard } from"@/components/ui/stat-card";
import { PageHeader } from"@/components/shell/page-header";

function Delta({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <p className="text-2xs text-muted-foreground">لا توجد بيانات للمقارنة</p>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <p className={`flex items-center gap-1 text-2xs font-medium ${up ?"text-success" :"text-destructive"}`}>
      <Icon className="h-3 w-3 shrink-0" />
      <span className="tabular-nums">{up ?"+" :""}{value}%</span>
      <span className="text-muted-foreground">{suffix}</span>
    </p>
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
  requireCanPlatform(me,"dashboard","view");
  const { month: rawMonth } = await searchParams;

  const now = new Date();
  const months = monthOptions(now);
  const selected = parseMonth(rawMonth, new Date(now.getFullYear(), now.getMonth(), 1));
  const selectedValue = monthValue(selected);

  const data = await platformDashboard(selected);

  const statusSlices = [
    { label:"نشطة", value: data.activeCompanies, color:"var(--color-success)" },
    { label:"متوقفة", value: data.suspendedCompanies, color:"var(--color-warning)" },
  ];

  const alerts = [
    {
      key:"dormant",
      label:"شركات لم تستخدم النظام منذ 7 أيام",
      count: data.dormantCompanies,
      href:"/platform/companies",
      icon: AlertCircle,
      tone:"bg-destructive/10 text-destructive",
    },
    {
      key:"unpaid",
      label:"فواتير مستحقة الدفع",
      count: data.unpaidInvoices,
      href:"/platform/billing",
      icon: Receipt,
      tone:"bg-warning/15 text-warning",
    },
    {
      key:"suspended",
      label:"شركات متوقفة حالياً",
      count: data.suspendedCompanies,
      href:"/platform/companies",
      icon: PauseCircle,
      tone:"bg-primary/10 text-primary",
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="لوحة التحكم"
        description="نظرة عامة على المنصة"
        actions={<MonthPicker months={months} value={selectedValue} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="إجمالي الشركات"
          value={data.totalCompanies.toLocaleString("en-US")}
          unit="شركة"
          icon={Users}
          tone="primary"
          footer={<p className="text-2xs text-muted-foreground">منذ بداية المنصة</p>}
        />
        <StatCard
          label="الشركات النشطة"
          value={data.activeCompanies.toLocaleString("en-US")}
          unit="شركة"
          icon={Building2}
          tone="warning"
          footer={
            <p className="text-2xs font-medium text-primary">
              <span className="tabular-nums">{data.activeShare}%</span>{""}
              <span className="text-muted-foreground">من إجمالي الشركات</span>
            </p>
          }
        />
        <StatCard
          label="إيرادات هذا الشهر"
          value={data.revenue.toLocaleString("en-US")}
          unit="ر.ي"
          icon={FileText}
          tone="primary"
          footer={<Delta value={data.revenueChange} suffix="عن الشهر الماضي" />}
        />
        <StatCard
          label="الكراتين هذا الشهر"
          value={data.cartonsThisMonth.toLocaleString("en-US")}
          unit="كرتون"
          icon={Package}
          tone="success"
          footer={<Delta value={data.cartonsChange} suffix="عن الشهر الماضي" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 shadow-sm">
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

        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-bold">استخدام الكراتين</h2>
          <AreaChart series={data.series} labelCurrent="الحالي" labelPrevious="الشهر الماضي" />
          <div className="mt-5 border-t pt-3">
            <PanelLink href="/platform/billing">عرض تقرير الاستخدام</PanelLink>
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-sm">
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
