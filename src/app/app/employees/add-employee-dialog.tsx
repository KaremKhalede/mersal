"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus } from "lucide-react";
import { createEmployeeAction } from "./actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export function AddEmployeeDialog({
  roles,
  branches,
  showBranchField,
}: {
  roles: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  /** Hidden for a branch-scoped creator — the server always pins the new employee to their own branch. */
  showBranchField: boolean;
}) {
  return (
    <FormDialog
      trigger={<Button><Plus className="h-4 w-4" /> موظف جديد</Button>}
      title="إضافة موظف جديد"
      action={createEmployeeAction}
      submitLabel="حفظ الموظف"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">الاسم الكامل *</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">البريد الإلكتروني *</Label>
          <Input id="email" name="email" type="email" dir="ltr" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">رقم الجوال *</Label>
          <Input id="phone" name="phone" dir="ltr" required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="password">كلمة المرور *</Label>
          <Input id="password" name="password" type="password" dir="ltr" required minLength={MIN_PASSWORD_LENGTH} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="passwordConfirm">تأكيد كلمة المرور *</Label>
          <Input id="passwordConfirm" name="passwordConfirm" type="password" dir="ltr" required minLength={MIN_PASSWORD_LENGTH} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>نوع الحساب *</Label>
          <Select name="userType" defaultValue="COMPANY_USER">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="COMPANY_USER">موظف</SelectItem>
              <SelectItem value="DRIVER">سائق</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>الدور الوظيفي *</Label>
          <Select name="roleId" required>
            <SelectTrigger><SelectValue placeholder="اختر الدور" /></SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {showBranchField && (
        <div className="space-y-1.5">
          <Label htmlFor="branchId">الفرع (اختياري)</Label>
          <select
            id="branchId"
            name="branchId"
            defaultValue=""
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">بدون فرع محدد</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </FormDialog>
  );
}
