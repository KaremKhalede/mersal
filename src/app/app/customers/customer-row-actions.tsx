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
import { updateCustomerAction, toggleCustomerStatusAction } from "./actions";

type Customer = { id: string; name: string; phone: string; email: string | null; address: string | null; homeBranchId: string | null; status: string };

export function CustomerRowActions({ customer, branches }: { customer: Customer; branches: { id: string; name: string }[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const isActive = customer.status === "ACTIVE";

  function toggleStatus() {
    startTransition(async () => {
      try {
        await toggleCustomerStatusAction(customer.id, isActive ? "INACTIVE" : "ACTIVE");
        router.refresh();
        toast.success(isActive ? "تم تعطيل العميل" : "تم تفعيل العميل");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ غير متوقع");
      }
    });
  }

  function handleEditSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateCustomerAction(customer.id, formData);
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
            <Link href={`/app/customers/${customer.id}`}><Eye className="h-4 w-4" /> عرض التفاصيل</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> تعديل
          </DropdownMenuItem>
          <DropdownMenuItem variant={isActive ? "destructive" : "default"} onSelect={toggleStatus} disabled={pending}>
            {isActive ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {isActive ? "تعطيل العميل" : "تفعيل العميل"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>تعديل بيانات العميل</DialogTitle></DialogHeader>
          <form action={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`name-${customer.id}`}>اسم العميل</Label>
              <Input id={`name-${customer.id}`} name="name" defaultValue={customer.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`phone-${customer.id}`}>رقم الجوال</Label>
              <Input id={`phone-${customer.id}`} name="phone" dir="ltr" defaultValue={customer.phone} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`email-${customer.id}`}>البريد الإلكتروني (اختياري)</Label>
              <Input id={`email-${customer.id}`} name="email" type="email" dir="ltr" defaultValue={customer.email ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`address-${customer.id}`}>العنوان (اختياري)</Label>
              <Input id={`address-${customer.id}`} name="address" defaultValue={customer.address ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`homeBranchId-${customer.id}`}>الفرع الرئيسي (اختياري)</Label>
              <select
                id={`homeBranchId-${customer.id}`}
                name="homeBranchId"
                defaultValue={customer.homeBranchId ?? ""}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">بدون فرع محدد</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
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
