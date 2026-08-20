"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, Ban, CheckCircle2, Trash2 } from "lucide-react";
import Link from "next/link";
import { toggleRoleStatusAction, deleteRoleAction } from "./actions";

type Role = { id: string; name: string; isActive: boolean; userCount: number };

export function RoleRowActions({ role }: { role: Role }) {
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggleStatus(nextActive: boolean) {
    startTransition(async () => {
      const result = await toggleRoleStatusAction(role.id, nextActive);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(nextActive ? "تم تفعيل الدور" : "تم تعطيل الدور");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRoleAction(role.id);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success("تم حذف الدور");
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
            <Link href={`/app/roles/${role.id}`}><Pencil className="h-4 w-4" /> تعديل</Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant={role.isActive ? "destructive" : "default"}
            onSelect={() => (role.isActive ? setConfirmDisableOpen(true) : toggleStatus(true))}
            disabled={pending}
          >
            {role.isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {role.isActive ? "تعطيل الدور" : "تفعيل الدور"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDeleteOpen(true)} disabled={pending}>
            <Trash2 className="h-4 w-4" /> حذف الدور
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعطيل الدور؟</DialogTitle>
            <DialogDescription>
              سيفقد كل من يحمل هذا الدور ({role.userCount} {role.userCount === 1 ? "موظف" : "موظفين"}) صلاحياته فورًا حتى إعادة تفعيل الدور.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDisableOpen(false)}>إلغاء</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => { setConfirmDisableOpen(false); toggleStatus(false); }}>
              تعطيل الدور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف الدور؟</DialogTitle>
            <DialogDescription>
              {role.userCount > 0
                ? "لا يمكن حذف هذا الدور لأنه مرتبط بموظفين. عدّل الدور أو انقل الموظفين إلى دور آخر أولًا."
                : "لا يمكن التراجع عن هذا الإجراء."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmDeleteOpen(false)}>إلغاء</Button>
            <Button type="button" variant="destructive" disabled={pending || role.userCount > 0} onClick={() => { setConfirmDeleteOpen(false); handleDelete(); }}>
              حذف الدور
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
