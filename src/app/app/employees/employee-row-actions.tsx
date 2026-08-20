"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { updateEmployeeAction, toggleEmployeeStatusAction, resetEmployeePasswordAction } from "./actions";
import { ResetPasswordDialog } from "@/components/shell/reset-password-dialog";

type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  branchId: string | null;
  status: string;
  role: { id: string; name: string } | null;
};

export function EmployeeRowActions({
  employee,
  roles,
  branches,
  showBranchField,
  isSelf,
  canEdit,
  canDisable,
}: {
  employee: Employee;
  roles: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  showBranchField: boolean;
  isSelf: boolean;
  canEdit: boolean;
  canDisable: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isActive = employee.status === "ACTIVE";

  function toggleStatus(nextStatus: "ACTIVE" | "DISABLED") {
    startTransition(async () => {
      try {
        await toggleEmployeeStatusAction(employee.id, nextStatus);
        router.refresh();
        toast.success(nextStatus === "DISABLED" ? "تم تعطيل حساب الموظف" : "تم تفعيل حساب الموظف");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  function handleEditSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateEmployeeAction(employee.id, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setEditOpen(false);
      router.refresh();
      toast.success("تم حفظ التعديلات");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/app/employees/${employee.id}`}><Eye className="h-4 w-4" /> عرض الموظف</Link>
          </DropdownMenuItem>
          {canEdit && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> تعديل
            </DropdownMenuItem>
          )}
          {/* Same permission as editing the employee — see resetEmployeePasswordAction. The dialog
              owns its own trigger, so `onSelect` is prevented rather than letting the menu close
              out from under it. */}
          {canEdit && (
            <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
              <div>
                <ResetPasswordDialog
                  asMenuItem
                  personName={employee.name}
                  action={() => resetEmployeePasswordAction(employee.id)}
                />
              </div>
            </DropdownMenuItem>
          )}
          {canDisable && (
            <DropdownMenuItem
              variant={isActive ? "destructive" : "default"}
              onSelect={() => (isActive ? setConfirmDisableOpen(true) : toggleStatus("ACTIVE"))}
              disabled={pending}
            >
              {isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {isActive ? "تعطيل الحساب" : "تفعيل الحساب"}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعطيل حساب الموظف؟</DialogTitle>
            <DialogDescription>لن يتمكن الموظف من تسجيل الدخول إلى النظام، ويمكن إعادة تفعيله لاحقًا.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDisableOpen(false)}>إلغاء</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmDisableOpen(false);
                toggleStatus("DISABLED");
              }}
            >
              تعطيل الحساب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canEdit && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>تعديل بيانات الموظف</DialogTitle></DialogHeader>
            <form action={handleEditSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor={`name-${employee.id}`}>الاسم الكامل</Label>
                <Input id={`name-${employee.id}`} name="name" defaultValue={employee.name} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`email-${employee.id}`}>البريد الإلكتروني</Label>
                  <Input id={`email-${employee.id}`} name="email" type="email" dir="ltr" defaultValue={employee.email} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`phone-${employee.id}`}>رقم الجوال</Label>
                  <Input id={`phone-${employee.id}`} name="phone" dir="ltr" defaultValue={employee.phone ?? ""} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>الدور الوظيفي {isSelf && <span className="text-xs text-muted-foreground">(لا يمكنك تغيير دورك الخاص)</span>}</Label>
                <Select name="roleId" defaultValue={employee.role?.id} disabled={isSelf}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="اختر الدور" /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isSelf && <input type="hidden" name="roleId" value={employee.role?.id ?? ""} />}
              </div>
              {showBranchField && (
                <div className="space-y-1.5">
                  <Label htmlFor={`branchId-${employee.id}`}>الفرع</Label>
                  <select
                    id={`branchId-${employee.id}`}
                    name="branchId"
                    defaultValue={employee.branchId ?? ""}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">بدون فرع محدد</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
                <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
