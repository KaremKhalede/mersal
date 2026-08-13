import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toMoney } from "@/lib/money";
import { PLATFORM_ID } from "@/lib/platform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updatePlatformSettingsAction } from "./actions";

export default async function PlatformSettingsPage() {
  await requirePlatformAdmin();
  const platform = await prisma.platform.findUniqueOrThrow({ where: { id: PLATFORM_ID } });

  return (
    <div className="space-y-4 max-w-xl">
      <h2 className="text-xl font-bold">إعدادات المنصة</h2>
      <Card>
        <CardHeader><CardTitle className="text-base">الإعدادات العامة</CardTitle></CardHeader>
        <CardContent>
          <form action={updatePlatformSettingsAction} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">اسم المنصة</Label>
              <Input id="name" name="name" defaultValue={platform.name} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feePerCartonYER">رسوم المنصة لكل كرتون (ريال يمني)</Label>
              <Input id="feePerCartonYER" name="feePerCartonYER" type="number" step="0.5" defaultValue={toMoney(platform.feePerCartonYER)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsappSenderName">اسم المرسل في واتساب</Label>
              <Input id="whatsappSenderName" name="whatsappSenderName" defaultValue={platform.whatsappSenderName} />
            </div>
            <Button type="submit">حفظ</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
