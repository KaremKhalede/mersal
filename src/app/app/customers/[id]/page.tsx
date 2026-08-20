import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getCustomerDetail } from "@/modules/customers/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShipmentStatusBadge, ActiveBadge } from "@/components/ui/status-badge";
import { User, ChevronRight, Phone, Mail, MapPin, Building2 } from "lucide-react";
import Link from "next/link";
import { formatBusinessDateTime } from "@/lib/timezone";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "customers", "view");
  const { id } = await params;
  const customer = await getCustomerDetail(user.companyId!, id, getBranchScope(user));
  if (!customer) notFound();

  return (
    <div className="space-y-4">
      <Link href="/app/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-4 w-4" /> رجوع إلى العملاء
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-6 w-6" />
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold">
              {customer.name}
              <ActiveBadge active={customer.status === "ACTIVE"} />
            </h2>
            <p className="flex items-center gap-1 text-sm text-muted-foreground" dir="ltr">
              <Phone className="h-3.5 w-3.5" /> {customer.phone}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoField icon={Phone} label="رقم الجوال" value={customer.phone} dir="ltr" />
          <InfoField icon={Mail} label="البريد الإلكتروني" value={customer.email ?? "—"} dir="ltr" />
          <InfoField icon={MapPin} label="العنوان" value={customer.address ?? "—"} />
          <InfoField icon={Building2} label="الفرع الرئيسي" value={customer.homeBranch?.name ?? "—"} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-2xl font-bold">{customer.shipments.length.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">إجمالي الشحنات</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">شحنات العميل</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الشحنة</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead>الوجهة</TableHead>
                <TableHead>عدد الكراتين</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customer.shipments.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/app/shipments/${s.id}`} className="font-medium text-primary hover:underline">{s.shipmentNumber}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatBusinessDateTime(s.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.unloadBranch.name}</TableCell>
                  <TableCell>{s.totalCartons}</TableCell>
                  <TableCell><ShipmentStatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
              {customer.shipments.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">لا توجد شحنات لهذا العميل</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoField({ icon: Icon, label, value, dir }: { icon: React.ElementType; label: string; value: string; dir?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium" dir={dir}>{value}</p>
      </div>
    </div>
  );
}
