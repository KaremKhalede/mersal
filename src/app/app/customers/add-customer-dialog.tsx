"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { Plus } from "lucide-react";
import { createCustomerAction } from "./actions";

export function AddCustomerDialog({ branches }: { branches: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <FormDialog
      trigger={<Button><Plus className="h-4 w-4" /> إضافة عميل</Button>}
      title="إضافة عميل جديد"
      action={createCustomerAction}
      submitLabel="حفظ العميل"
      onSuccess={(result) => {
        if (result && "existed" in result && result.customerId) {
          if (result.existed) {
            toast.info(`يوجد عميل بهذا الرقم بالفعل: ${result.customerName} — تم فتح بياناته`);
          }
          router.push(`/app/customers/${result.customerId}`);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">اسم العميل *</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="phone">رقم الجوال *</Label>
        <Input id="phone" name="phone" dir="ltr" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">البريد الإلكتروني (اختياري)</Label>
        <Input id="email" name="email" type="email" dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">العنوان (اختياري)</Label>
        <Input id="address" name="address" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="homeBranchId">الفرع الرئيسي (اختياري)</Label>
        <select
          id="homeBranchId"
          name="homeBranchId"
          defaultValue=""
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">بدون فرع محدد</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
    </FormDialog>
  );
}
