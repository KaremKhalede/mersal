"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PermissionGrid } from "../permission-grid";
import type { Permissions } from "@/lib/enums";
import { updateRoleAction, deleteRoleAction } from "../actions";

export function EditRoleForm({ role, userCount }: { role: { id: string; name: string; description: string | null; permissions: string }; userCount: number }) {
  const [pending, startTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const router = useRouter();
  const permissions: Permissions = JSON.parse(role.permissions);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateRoleAction(role.id, formData);
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("تم حفظ التغييرات");
      router.push("/app/roles");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRoleAction(role.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.push("/app/roles");
    });
  }

  return (
    <>
      <form action={handleSubmit} className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم الدور</Label>
            <Input id="name" name="name" defaultValue={role.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">الوصف</Label>
            <Textarea id="description" name="description" defaultValue={role.description ?? ""} rows={3} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>حفظ التغييرات</Button>
            <Button type="button" variant="outline" onClick={() => router.push("/app/roles")}>إلغاء</Button>
            <Button type="button" variant="destructive" className="ms-auto" onClick={() => setConfirmDeleteOpen(true)} disabled={pending}>حذف الدور</Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>الصلاحيات</Label>
          <PermissionGrid defaultPermissions={permissions} />
        </div>
      </form>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف الدور؟</DialogTitle>
            <DialogDescription>
              {userCount > 0
                ? "لا يمكن حذف هذا الدور لأنه مرتبط بموظفين. عدّل الدور أو انقل الموظفين إلى دور آخر أولًا."
                : "لا يمكن التراجع عن هذا الإجراء."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteOpen(false)}>إلغاء</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || userCount > 0}
              onClick={() => {
                setConfirmDeleteOpen(false);
                handleDelete();
              }}
            >
              حذف الدور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
