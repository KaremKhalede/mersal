"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { updatePlatformRoleAction } from "../actions";

type ActionCell = { action: string; key: string; label: string; checked: boolean; allowed: boolean };
type Row = { resource: string; label: string; actions: ActionCell[] };

/**
 * Permission matrix. Checkboxes post as `perm:<resource>.<action>` — the server parses them through
 * the registry, so the form can never store a key the code doesn't enforce.
 */
export function RoleForm({
  roleId,
  name,
  description,
  isSystem,
  isActive,
  matrix,
}: {
  roleId: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  matrix: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updatePlatformRoleAction(roleId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success("تم حفظ الدور");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم الدور</Label>
            {/* System role names are fixed so "مدير المنصة" stays recognisable. */}
            <Input id="name" name="name" defaultValue={name} disabled={isSystem} required={!isSystem} />
            {isSystem && <p className="text-2xs text-muted-foreground">اسم الدور النظامي غير قابل للتعديل.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">الوصف</Label>
            <Input id="description" name="description" defaultValue={description} placeholder="يظهر عند اختيار الدور" />
          </div>
          {!isSystem && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox name="isActive" defaultChecked={isActive} />
              الدور مفعّل ويمكن إسناده للمستخدمين
            </label>
          )}
          {isSystem && <input type="hidden" name="isActive" value="on" />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <h2 className="border-b px-4 py-3 text-sm font-bold">الصلاحيات</h2>
          <ul className="divide-y">
            {matrix.map((row) => (
              <li key={row.resource} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-medium">{row.label}</span>
                <div className="flex flex-wrap items-center gap-4">
                  {row.actions.map((a) => (
                    <label
                      key={a.key}
                      className={`flex items-center gap-2 text-sm ${a.allowed ? "" : "cursor-not-allowed opacity-50"}`}
                      title={a.allowed ? undefined : "لا يمكنك منح صلاحية لا تملكها"}
                    >
                      <Checkbox name={`perm:${a.key}`} defaultChecked={a.checked} disabled={!a.allowed} />
                      {a.label}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/platform/settings")} disabled={pending}>
          إلغاء
        </Button>
        <Button type="submit" disabled={pending}>{pending ? "جارٍ الحفظ..." : "حفظ"}</Button>
      </div>
    </form>
  );
}
