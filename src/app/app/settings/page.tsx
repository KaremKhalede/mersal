import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateCompanySettingsAction } from "./actions";

export default async function SettingsPage() {
  const user = await requireCompanyUser();
  requireCan(user, "settings", "view");
  const company = user.company!;

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-xl font-bold">إعدادات الشركة</h2>
      <Card>
        <CardHeader><CardTitle className="text-base">الملف العام</CardTitle></CardHeader>
        <CardContent>
          <form action={updateCompanySettingsAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">اسم الشركة</Label>
              <Input id="name" name="name" defaultValue={company.name} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input id="phone" name="phone" defaultValue={company.phone ?? ""} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" name="email" defaultValue={company.email ?? ""} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logoColor">لون العلامة التجارية</Label>
              <Input id="logoColor" name="logoColor" type="color" defaultValue={company.logoColor} className="w-24 h-10 p-1" />
            </div>
            <Button type="submit">حفظ التغييرات</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">واتساب</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>يتم إرسال إشعارات واتساب حالياً عبر رقم المنصة المركزي، وتظهر برسائل تحمل اسم شركتك تلقائياً.</p>
          <p>سيتم دعم ربط رقم واتساب خاص بشركتك في مرحلة لاحقة.</p>
        </CardContent>
      </Card>
    </div>
  );
}
