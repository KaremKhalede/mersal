import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getEmployeeDetail } from "@/modules/users/service";
import { getBranchScope } from "@/lib/branch-scope";
import { formatBusinessDateTime } from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ui/status-badge";
import { UserRound, ChevronRight, Mail, Phone, Shield, Building2, KeyRound } from "lucide-react";

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "employees", "view");
  const { id } = await params;
  const employee = await getEmployeeDetail(user.companyId!, id, getBranchScope(user));
  if (!employee) notFound();

  return (
    <div className="space-y-4">
      <Link href="/app/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight className="h-4 w-4" /> رجوع إلى الموظفين
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserRound className="h-6 w-6" />
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {employee.name}
            <ActiveBadge active={employee.status === "ACTIVE"} />
          </h2>
          <p className="text-sm text-muted-foreground">{employee.role?.name ?? (employee.userType === "DRIVER" ? "سائق" : "—")}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><UserRound className="h-4 w-4" /> معلومات الموظف</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="الاسم الكامل" value={employee.name} />
          <Field label={<span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> البريد الإلكتروني</span>} value={<span dir="ltr">{employee.email}</span>} />
          <Field label={<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> رقم الجوال</span>} value={employee.phone ? <span dir="ltr">{employee.phone}</span> : "—"} />
          <Field label={<span className="inline-flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> الدور الوظيفي</span>} value={employee.role?.name ?? (employee.userType === "DRIVER" ? "سائق" : "—")} />
          <Field label={<span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> الفرع</span>} value={employee.branch?.name ?? "بدون فرع محدد"} />
          <Field label="رقم الموظف" value={<span dir="ltr">{employee.employeeCode ?? "—"}</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base"><KeyRound className="h-4 w-4" /> معلومات الوصول</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="حالة الحساب" value={<ActiveBadge active={employee.status === "ACTIVE"} />} />
          <Field label="تاريخ الإنشاء" value={formatBusinessDateTime(employee.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })} />
        </CardContent>
      </Card>
    </div>
  );
}
