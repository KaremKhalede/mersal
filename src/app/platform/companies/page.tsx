import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { requireCanPlatform, canPlatform } from "@/lib/rbac";
import { listPlatformCompanies, platformCompanyCounts, type CompanyPeriod } from "@/modules/companies/service";
import { getCurrentPlatformFee } from "@/modules/billing/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import { FormDialog } from "@/components/shell/form-dialog";
import { CompaniesToolbar } from "./companies-toolbar";
import { CompanyRowActions } from "./row-actions";
import { Plus, Building2, CheckCircle2, PauseCircle } from "lucide-react";
import { formatBusinessDate, formatBusinessTime } from "@/lib/timezone";
import { createCompanyAction } from "./actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { formatYER } from "@/lib/money";

/** "منذ N يوم" for recent activity, falling back to a date once it stops being useful. */
function relativeActivity(date: Date | null) {
  if (!date) return "لا يوجد نشاط";
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return `اليوم ${formatBusinessTime(date)}`;
  if (days === 1) return `أمس ${formatBusinessTime(date)}`;
  if (days < 30) return `منذ ${days} يوماً`;
  return formatBusinessDate(date);
}

export default async function PlatformCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; period?: string; page?: string; pageSize?: string }>;
}) {
  const me = await requirePlatformAdmin();
  requireCanPlatform(me, "companies", "view");
  const sp = await searchParams;
  const canManage = canPlatform(me, "companies", "manage");

  const search = sp.q?.trim() ?? "";
  const status = sp.status ?? "";
  const period = (["all", "30d", "90d", "year"].includes(sp.period ?? "") ? sp.period : "all") as CompanyPeriod;
  const page = Math.max(Number(sp.page) || 1, 1);
  const pageSize = Number(sp.pageSize) || 10;

  const [{ items, total, pageCount }, counts, feePerCarton] = await Promise.all([
    listPlatformCompanies({ search, status, period, page, pageSize }),
    platformCompanyCounts(),
    getCurrentPlatformFee(),
  ]);

  const qs = [
    search ? `q=${encodeURIComponent(search)}` : "",
    status ? `status=${status}` : "",
    period !== "all" ? `period=${period}` : "",
    sp.pageSize ? `pageSize=${sp.pageSize}` : "",
  ]
    .filter(Boolean)
    .join("&");

  return (
    <div className="space-y-4">
      <PageHeader
        title="الشركات"
        description="إدارة جميع الشركات المشتركة في المنصة"
        actions={canManage && <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> إضافة شركة جديدة</Button>}
          title="إضافة شركة شحن جديدة"
          description="سيتم إنشاء حساب مدير الشركة تلقائياً"
          action={createCompanyAction}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="name">اسم الشركة</Label><Input id="name" name="name" required /></div>
            <div className="space-y-1.5"><Label htmlFor="slug">المعرف (بالإنجليزية)</Label><Input id="slug" name="slug" dir="ltr" required /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="phone">الهاتف</Label><Input id="phone" name="phone" dir="ltr" /></div>
            <div className="space-y-1.5"><Label htmlFor="email">البريد الإلكتروني</Label><Input id="email" name="email" dir="ltr" /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="adminName">اسم مدير الشركة</Label><Input id="adminName" name="adminName" required /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="adminEmail">بريد المدير</Label><Input id="adminEmail" name="adminEmail" type="email" dir="ltr" required /></div>
            <div className="space-y-1.5"><Label htmlFor="adminPassword">كلمة المرور</Label><Input id="adminPassword" name="adminPassword" type="password" dir="ltr" required minLength={MIN_PASSWORD_LENGTH} /></div>
          </div>
        </FormDialog>}
      />

      <CompaniesToolbar search={search} status={status} period={period} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="إجمالي الشركات" value={counts.total} icon={Building2} tone="primary" />
        <StatCard
          label="نشطة"
          value={counts.active}
          icon={CheckCircle2}
          tone="success"
          footer={
            counts.total ? (
              <p className="text-2xs text-muted-foreground tabular-nums">
                {Math.round((counts.active / counts.total) * 100)}% من الإجمالي
              </p>
            ) : null
          }
        />
        <StatCard
          label="متوقفة"
          value={counts.suspended}
          icon={PauseCircle}
          tone="warning"
          footer={
            counts.total ? (
              <p className="text-2xs text-muted-foreground tabular-nums">
                {Math.round((counts.suspended / counts.total) * 100)}% من الإجمالي
              </p>
            ) : null
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">لا توجد شركات مطابقة لبحثك</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الشركة</TableHead>
                    <TableHead>الخطة / النوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>تاريخ التسجيل</TableHead>
                    <TableHead>آخر نشاط</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((c) => (
                    <TableRow key={c.id} className="transition-colors hover:bg-muted/40">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
                            style={{ backgroundColor: c.logoColor }}
                            aria-hidden="true"
                          >
                            <Building2 className="h-4.5 w-4.5" />
                          </span>
                          <span className="min-w-0">
                            <Link href={`/platform/companies/${c.id}`} className="block truncate font-medium hover:text-primary hover:underline">
                              {c.name}
                            </Link>
                            <span className="block truncate text-2xs text-muted-foreground" dir="ltr">{c.slug}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">استخدام</span>
                        <span className="block text-2xs text-muted-foreground tabular-nums">{formatYER(feePerCarton)} / كرتون</span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            c.status === "ACTIVE"
                              ? "border-success/30 bg-success/15 text-success"
                              : "border-warning/30 bg-warning/15 text-warning"
                          }
                        >
                          <span className={`me-1 h-1.5 w-1.5 rounded-full ${c.status === "ACTIVE" ? "bg-success" : "bg-warning"}`} />
                          {c.status === "ACTIVE" ? "نشطة" : "متوقفة"}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{formatBusinessDate(c.createdAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{relativeActivity(c.lastActivity)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/platform/companies/${c.id}`}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            عرض التفاصيل
                          </Link>
                          <Link
                            href={`/platform/billing/${c.id}`}
                            className="text-xs font-medium text-muted-foreground hover:text-primary hover:underline"
                          >
                            الفوترة
                          </Link>
                          {canManage && <CompanyRowActions companyId={c.id} status={c.status} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        itemsShown={items.length}
        itemLabel="شركة"
        pageSize={pageSize}
        buildHref={(p) => `/platform/companies?page=${p}${qs ? `&${qs}` : ""}`}
      />
    </div>
  );
}
