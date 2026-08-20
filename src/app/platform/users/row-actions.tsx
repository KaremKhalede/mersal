"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pencil, ShieldCheck, PauseCircle, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updatePlatformUserAction, setPlatformUserStatusAction, resetPlatformUserPasswordAction } from "./actions";
import { ResetPasswordDialog } from "@/components/shell/reset-password-dialog";

export type PlatformUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  platformRoleId: string | null;
  platformRoleRef: { id: string; name: string; isSuperAdmin: boolean } | null;
};

export type AssignableRole = { id: string; name: string; description: string | null; isSuperAdmin: boolean };

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Per-row actions. "تغيير الدور" opens the same edit dialog focused on the role field rather than a
 * second form — one place that writes a user, so validation can't diverge between the two paths.
 */
export function PlatformUserRowActions({
  user,
  isSelf,
  roles,
}: {
  user: PlatformUserRow;
  isSelf: boolean;
  roles: AssignableRole[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const active = user.status === "ACTIVE";

  function submitEdit(formData: FormData) {
    startTransition(async () => {
      const result = await updatePlatformUserAction(user.id, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setEditOpen(false);
      toast.success("تم حفظ التعديلات");
      router.refresh();
    });
  }

  function toggleStatus() {
    startTransition(async () => {
      const result = await setPlatformUserStatusAction(user.id, active ? "DISABLED" : "ACTIVE");
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setStatusOpen(false);
      toast.success(active ? "تم إيقاف المستخدم" : "تم تفعيل المستخدم");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="إجراءات المستخدم" disabled={pending}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> تعديل المستخدم
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <ShieldCheck className="h-4 w-4" /> تغيير الدور
          </DropdownMenuItem>
          {/* The dialog owns its own trigger, so the menu item's default select-and-close is
              prevented rather than letting the menu unmount the dialog as it opens. */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div>
              <ResetPasswordDialog
                asMenuItem
                personName={user.name}
                action={() => resetPlatformUserPasswordAction(user.id)}
              />
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setStatusOpen(true)} disabled={active && isSelf}>
            {active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {active ? "إيقاف المستخدم" : "تفعيل المستخدم"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form action={submitEdit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>تعديل المستخدم</DialogTitle>
              <DialogDescription>تغيير الحالة يتم من قائمة الإجراءات بتأكيد منفصل.</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <Label htmlFor={`name-${user.id}`}>الاسم</Label>
              <Input id={`name-${user.id}`} name="name" defaultValue={user.name} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`email-${user.id}`}>البريد الإلكتروني</Label>
                <Input id={`email-${user.id}`} name="email" type="email" defaultValue={user.email} dir="ltr" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`phone-${user.id}`}>رقم الجوال</Label>
                <Input id={`phone-${user.id}`} name="phone" defaultValue={user.phone ?? ""} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`role-${user.id}`}>الدور</Label>
              <select
                id={`role-${user.id}`}
                name="platformRoleId"
                defaultValue={user.platformRoleId ?? roles[0]?.id}
                className={selectClass}
                required
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">الدور يحدد الصفحات التي يصل إليها المستخدم.</p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={pending}>
                إلغاء
              </Button>
              <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active ? "إيقاف المستخدم" : "تفعيل المستخدم"}</DialogTitle>
            <DialogDescription>
              {active
                ? "لن يتمكن المستخدم من تسجيل الدخول إلى لوحة إدارة المنصة."
                : "سيستعيد المستخدم القدرة على تسجيل الدخول إلى لوحة إدارة المنصة."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{user.name}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant={active ? "destructive" : "default"}
              onClick={toggleStatus}
              disabled={pending}
            >
              {active ? "إيقاف المستخدم" : "تفعيل المستخدم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
