import Link from"next/link";
import { notFound } from"next/navigation";
import { requirePlatformAdmin } from"@/lib/auth";
import { requireCanPlatform, canPlatform } from"@/lib/rbac";
import { getCompanyDetail } from"@/modules/companies/service";
import {
  platformBillingCompanyDetail,
  listCompanyInvoiceStates,
  getCurrentPlatformFee,
  INVOICE_STATE_LABELS,
  INVOICE_STATE_STYLES,
} from"@/modules/billing/service";
import { Card, CardContent } from"@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from"@/components/ui/table";
import { Badge } from"@/components/ui/badge";
import { Button } from"@/components/ui/button";
import { Input } from"@/components/ui/input";
import { Label } from"@/components/ui/label";
import { FormDialog } from"@/components/shell/form-dialog";
import { formatBusinessDate } from"@/lib/timezone";
import { updateCompanyProfileAction } from"../actions";
import {
  Building2,
  ChevronLeft,
  CalendarDays,
  UserRound,
  Mail,
  Phone,
  Package,
  Receipt,
  Wallet,
  CircleAlert,
  Users,
  Truck,
  Pencil,
} from"lucide-react";
import { cn } from"@/lib/utils";
import { ResetPasswordDialog } from"@/components/shell/reset-password-dialog";
import { resetCompanyUserPasswordAction } from"../actions";
import { StatCard } from"@/components/ui/stat-card";
import { PageHeader } from"@/components/shell/page-header";
import { formatAmount, formatYER } from"@/lib/money";

const money = (n: number) => formatAmount(n, 2);
const int = (n: number) => n.toLocaleString("en-US");

/** One contact fact with its icon tile — the strip under the page header. */
function ContactItem({
  label,
  value,
  icon: Icon,
  ltr,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium" dir={ltr ?"ltr" : undefined}>{value}</p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1 text-2xs text-muted-foreground">{unit}</p>
      </div>
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-2.5 last:border-0">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 text-end text-sm font-medium">{children}</span>
    </div>
  );
}

export default async function PlatformCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me,"companies","view");
  const { id } = await params;

  const month = new Date();
  const [company, billing, invoices, feePerCarton] = await Promise.all([
    getCompanyDetail(id, month),
    platformBillingCompanyDetail(id, month),
    listCompanyInvoiceStates(id),
    getCurrentPlatformFee(),
  ]);
  if (!company || !billing) notFound();

  const active = company.status ==="ACTIVE";
  const latestInvoices = invoices.slice(0, 3);

  return (
    <div className="space-y-4">
      <PageHeader
        variant="record"
        title={company.name}
        description={`${company.slug} · عضو منذ ${formatBusinessDate(company.createdAt)}`}
        badge={
          <Badge
            variant="outline"
            className={active ?"border-success/30 bg-success/15 text-success" :"border-warning/30 bg-warning/15 text-warning"}
          >
            {active ?"نشطة" :"متوقفة"}
          </Badge>
        }
        parent={{ label: "الشركات", href: "/platform/companies" }}
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <ContactItem label="تاريخ التسجيل" value={formatBusinessDate(company.createdAt)} icon={CalendarDays} ltr />
          <ContactItem label="المالك" value={company.owner?.name ??"—"} icon={UserRound} />
          <ContactItem label="البريد الإلكتروني" value={company.email ?? company.owner?.email ??"—"} icon={Mail} ltr />
          <ContactItem label="الهاتف" value={company.phone ??"—"} icon={Phone} ltr />
        </CardContent>
        {/* The only recovery path when the locked-out person IS the company admin — nobody inside
            the tenant outranks them. See resetCompanyUserPasswordAction. */}
        {company.owner && (
          <CardContent className="border-t p-4 pt-4">
            <ResetPasswordDialog
              personName={company.owner.name}
              triggerLabel="إعادة تعيين كلمة مرور المالك"
              action={resetCompanyUserPasswordAction.bind(null, company.id, company.owner.id)}
            />
          </CardContent>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-bold">ملخص مالي (هذا الشهر)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="الكراتين هذا الشهر" value={int(billing.cartons)} unit="كرتون" icon={Package} tone="success" />
          <Metric label="المستحق" value={money(billing.due)} unit="ر.ي" icon={Receipt} tone="warning" />
          <Metric label="المحصل" value={money(billing.collected)} unit="ر.ي" icon={Wallet} tone="primary" />
          <Metric label="المتبقي" value={money(billing.remaining)} unit="ر.ي" icon={CircleAlert} tone="destructive" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-2 text-sm font-bold">معلومات الشركة</h2>
            <InfoRow label="اسم الشركة">{company.name}</InfoRow>
            <InfoRow label="معرف الشركة"><span dir="ltr">{company.slug}</span></InfoRow>
            <InfoRow label="حالة الشركة">
              <Badge
                variant="outline"
                className={active ?"border-success/30 bg-success/15 text-success" :"border-warning/30 bg-warning/15 text-warning"}
              >
                {active ?"نشطة" :"متوقفة"}
              </Badge>
            </InfoRow>
            {/*"التسعير" not"الباقة": the platform is usage-priced, there are no packages. */}
            <InfoRow label="التسعير">حسب الاستخدام ({formatYER(feePerCarton, 2)} / كرتون)</InfoRow>
            <InfoRow label="المالك">{company.owner?.name ??"—"}</InfoRow>
            <InfoRow label="عدد الفروع">{int(company.branches.length)}</InfoRow>
            <InfoRow label="عدد المستخدمين">{int(company._count.users)}</InfoRow>

            <div className="mt-4">
              {canPlatform(me,"companies","manage") && <FormDialog
                trigger={
                  <Button variant="outline" className="h-9">
                    <Pencil className="h-4 w-4" /> تعديل معلومات الشركة
                  </Button>
                }
                title="تعديل معلومات الشركة"
                description="بيانات التواصل فقط — إعدادات الشركة الأخرى تُدار من حساب الشركة"
                action={updateCompanyProfileAction.bind(null, company.id)}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="name">اسم الشركة</Label>
                  <Input id="name" name="name" defaultValue={company.name} required />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">الهاتف</Label>
                    <Input id="phone" name="phone" defaultValue={company.phone ??""} dir="ltr" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
                    <Input id="email" name="email" defaultValue={company.email ??""} dir="ltr" />
                  </div>
                </div>
              </FormDialog>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <h2 className="border-b px-4 py-3 text-sm font-bold">آخر الفواتير</h2>
            {latestInvoices.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">لا توجد فواتير صادرة بعد</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>رقم الفاتورة</TableHead>
                      <TableHead>تاريخ الفاتورة</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestInvoices.map((inv) => (
                      <TableRow key={inv.id} className="transition-colors hover:bg-muted/40">
                        <TableCell dir="ltr" className="font-medium">{inv.invoiceNumber}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{formatBusinessDate(inv.createdAt)}</TableCell>
                        <TableCell className="tabular-nums">{formatYER(inv.totalAmount, 2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={INVOICE_STATE_STYLES[inv.state]}>
                            {INVOICE_STATE_LABELS[inv.state]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="border-t p-3">
              <Link
                href={`/platform/billing/${company.id}`}
                className="group inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                عرض جميع الفواتير
                <ChevronLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-bold">نظرة سريعة</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="عدد المستخدمين" value={int(company._count.users)} unit="مستخدم" icon={Users} tone="primary" />
            <StatCard label="عدد الفروع" value={int(company.branches.length)} unit="فرع" icon={Building2} tone="primary" />
            <StatCard label="إجمالي الكراتين" value={int(company.monthly.cartons)} unit="هذا الشهر" icon={Package} tone="warning" />
            <StatCard label="إجمالي الرحلات" value={int(company.monthly.trips)} unit="هذا الشهر" icon={Truck} tone="success" />
            <StatCard label="إجمالي الشحنات" value={int(company.monthly.shipments)} unit="هذا الشهر" icon={Package} tone="primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
