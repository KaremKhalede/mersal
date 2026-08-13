import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listEmployees } from "@/modules/users/service";
import { listRoles } from "@/modules/roles/service";
import { listBranches } from "@/modules/branches/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shell/form-dialog";
import { ActionButton } from "@/components/shell/action-button";
import { Plus } from "lucide-react";
import { createEmployeeAction, toggleEmployeeStatusAction } from "./actions";

export default async function EmployeesPage() {
  const user = await requireCompanyUser();
  requireCan(user, "employees", "view");
  const [employees, roles, branches] = await Promise.all([
    listEmployees(user.companyId!),
    listRoles(user.companyId!),
    listBranches(user.companyId!),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الموظفون</h2>
        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> موظف جديد</Button>}
          title="إضافة موظف جديد"
          action={async (fd) => {
            "use server";
            return createEmployeeAction(fd);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name">الاسم الكامل</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employeeCode">الرقم الوظيفي</Label>
              <Input id="employeeCode" name="employeeCode" placeholder="EMP-1007" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" name="email" type="email" dir="ltr" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">رقم الجوال</Label>
              <Input id="phone" name="phone" dir="ltr" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">كلمة المرور</Label>
            <Input id="password" name="password" type="password" dir="ltr" required minLength={6} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>نوع الحساب</Label>
              <Select name="userType" defaultValue="COMPANY_USER">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPANY_USER">موظف</SelectItem>
                  <SelectItem value="DRIVER">سائق</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>الفرع</Label>
              <Select name="branchId">
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>الدور الوظيفي</Label>
            <Select name="roleId">
              <SelectTrigger><SelectValue placeholder="اختر الدور" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FormDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الرقم الوظيفي</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الفرع</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{e.email}</p>
                  </TableCell>
                  <TableCell>{e.employeeCode ?? "—"}</TableCell>
                  <TableCell>{e.userType === "DRIVER" ? "سائق" : e.role?.name ?? "—"}</TableCell>
                  <TableCell>{e.branch?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={e.status === "ACTIVE" ? "border-success/30 bg-success/15 text-success" : "bg-muted"}>
                      {e.status === "ACTIVE" ? "نشط" : "معطّل"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionButton
                      action={async () => {
                        "use server";
                        await toggleEmployeeStatusAction(e.id, e.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
                      }}
                    >
                      {e.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    لا يوجد موظفون بعد
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
