"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { updateBranchAction, toggleBranchStatusAction } from "./actions";

type Branch = { id: string; name: string; city: string; country: string; status: string };

export function BranchRowActions({ branch }: { branch: Branch }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isActive = branch.status === "ACTIVE";

  function toggleStatus() {
    startTransition(async () => {
      try {
        await toggleBranchStatusAction(branch.id, isActive ? "INACTIVE" : "ACTIVE");
        router.refresh();
        toast.success(isActive ? "تم تعطيل الفرع" : "تم تفعيل الفرع");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  function handleEditSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateBranchAction(branch.id, formData);
        setEditOpen(false);
        router.refresh();
        toast.success("تم حفظ التعديلات");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
      }
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
            <Link href={`/app/branches/${branch.id}`}><Eye className="h-4 w-4" /> عرض التفاصيل</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> تعديل
          </DropdownMenuItem>
          <DropdownMenuItem variant={isActive ? "destructive" : "default"} onSelect={toggleStatus} disabled={pending}>
            {isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {isActive ? "تعطيل الفرع" : "تفعيل الفرع"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل الفرع</DialogTitle></DialogHeader>
          <form action={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${branch.id}`}>اسم الفرع</Label>
              <Input id={`name-${branch.id}`} name="name" defaultValue={branch.name} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`city-${branch.id}`}>المدينة</Label>
                <Input id={`city-${branch.id}`} name="city" defaultValue={branch.city} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`country-${branch.id}`}>الدولة</Label>
                <Input id={`country-${branch.id}`} name="country" defaultValue={branch.country} required />
              </div>
            </div>
            <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
