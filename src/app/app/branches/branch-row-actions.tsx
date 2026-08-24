"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Eye, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { updateBranchAction, toggleBranchStatusAction } from "./actions";

type Branch = { id: string; name: string; city: string; country: string; status: string; phone: string | null; address: string | null };

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

      {/* Controlled: opened from a menu item, so the dialog cannot own a nested trigger. */}
      <FormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="تعديل الفرع"
        successMessage="تم حفظ التعديلات"
        action={(formData) => updateBranchAction(branch.id, formData)}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`name-${branch.id}`}>اسم الفرع</Label>
          <Input id={`name-${branch.id}`} name="name" defaultValue={branch.name} required />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`city-${branch.id}`}>المدينة</Label>
            <Input id={`city-${branch.id}`} name="city" defaultValue={branch.city} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`country-${branch.id}`}>الدولة</Label>
            <Input id={`country-${branch.id}`} name="country" defaultValue={branch.country} required />
          </div>
        </div>
        {/* Same two optional fields as the create dialog, and deliberately the same order — the
            edit form is where most branches will get a number, since they all predate the column. */}
        <div className="space-y-1.5">
          <Label htmlFor={`phone-${branch.id}`}>هاتف الفرع</Label>
          <Input id={`phone-${branch.id}`} name="phone" dir="ltr" defaultValue={branch.phone ?? ""} placeholder="+967 77 123 4567" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`address-${branch.id}`}>عنوان الفرع</Label>
          <Input id={`address-${branch.id}`} name="address" defaultValue={branch.address ?? ""} placeholder="الشارع، أقرب معلم" />
        </div>
      </FormDialog>
    </>
  );
}
