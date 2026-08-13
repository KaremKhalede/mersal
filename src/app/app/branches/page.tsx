import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listBranches } from "@/modules/branches/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { ActionButton } from "@/components/shell/action-button";
import { Plus } from "lucide-react";
import { createBranchAction, toggleBranchStatusAction } from "./actions";

export default async function BranchesPage() {
  const user = await requireCompanyUser();
  requireCan(user, "branches", "view");
  const branches = await listBranches(user.companyId!);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">الفروع</h2>
        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> فرع جديد</Button>}
          title="إضافة فرع جديد"
          action={async (fd) => {
            "use server";
            await createBranchAction(fd);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">اسم الفرع</Label>
            <Input id="name" name="name" placeholder="فرع الرياض" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="city">المدينة</Label>
              <Input id="city" name="city" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">الدولة</Label>
              <Input id="country" name="country" required />
            </div>
          </div>
        </FormDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم الفرع</TableHead>
                <TableHead>المدينة</TableHead>
                <TableHead>الدولة</TableHead>
                <TableHead>عدد الموظفين</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.city}</TableCell>
                  <TableCell>{b.country}</TableCell>
                  <TableCell>{b._count.employees}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={b.status === "ACTIVE" ? "border-success/30 bg-success/15 text-success" : "bg-muted"}>
                      {b.status === "ACTIVE" ? "نشط" : "غير نشط"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionButton
                      action={async () => {
                        "use server";
                        await toggleBranchStatusAction(b.id, b.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
                      }}
                    >
                      {b.status === "ACTIVE" ? "تعطيل" : "تفعيل"}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    لا توجد فروع بعد
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
