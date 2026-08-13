import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { listVehicles } from "@/modules/vehicles/service";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/components/shell/form-dialog";
import { ActionButton } from "@/components/shell/action-button";
import { Plus } from "lucide-react";
import { createVehicleAction, toggleVehicleActiveAction } from "./actions";

export default async function VehiclesPage() {
  const user = await requireCompanyUser();
  requireCan(user, "vehicles", "view");
  const vehicles = await listVehicles(user.companyId!);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">المركبات</h2>
        <FormDialog
          trigger={<Button><Plus className="h-4 w-4" /> مركبة جديدة</Button>}
          title="إضافة مركبة جديدة"
          action={async (fd) => {
            "use server";
            await createVehicleAction(fd);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="plateNumber">رقم اللوحة</Label>
            <Input id="plateNumber" name="plateNumber" dir="ltr" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">النوع (اختياري)</Label>
            <Input id="type" name="type" placeholder="شاحنة كبيرة" />
          </div>
        </FormDialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم اللوحة</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>عدد الرحلات</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium" dir="ltr">{v.plateNumber}</TableCell>
                  <TableCell>{v.type ?? "—"}</TableCell>
                  <TableCell>{v._count.trips}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={v.isActive ? "border-success/30 bg-success/15 text-success" : "bg-muted"}>
                      {v.isActive ? "نشطة" : "غير نشطة"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionButton
                      action={async () => {
                        "use server";
                        await toggleVehicleActiveAction(v.id, !v.isActive);
                      }}
                    >
                      {v.isActive ? "تعطيل" : "تفعيل"}
                    </ActionButton>
                  </TableCell>
                </TableRow>
              ))}
              {vehicles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    لا توجد مركبات بعد
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
