import { requireDriver } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { MapPin, Boxes, Package, ArrowLeft } from "lucide-react";

export default async function DriverHomePage() {
  const user = await requireDriver();

  const trip = await prisma.trip.findFirst({
    where: { driverId: user.id, status: { in: ["PLANNED", "IN_PROGRESS"] } },
    include: { stops: { orderBy: { sequence: "asc" }, include: { branch: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <Package className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">لا توجد رحلة نشطة حالياً</p>
      </div>
    );
  }

  const currentStop = trip.stops.find((s) => s.status !== "DEPARTED" && s.status !== "DONE") ?? trip.stops[trip.stops.length - 1];
  const totalShipments = await prisma.tripShipmentStop.count({ where: { tripId: trip.id } });
  const totalCartons = await prisma.tripShipmentStop.aggregate({ where: { tripId: trip.id }, _sum: { cartonsLoaded: true } });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">السلام عليكم</p>
        <h1 className="text-xl font-bold">{user.name}</h1>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">رحلتكم الحالية</p>
            <div className="flex items-center gap-2 text-lg font-bold flex-wrap">
              {trip.stops.map((s, i) => (
                <span key={s.id} className="flex items-center gap-2">
                  {s.branch.name}
                  {i < trip.stops.length - 1 && <ArrowLeft className="h-4 w-4 text-muted-foreground" />}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1" dir="ltr">{trip.tripNumber}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{totalShipments}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Package className="h-3 w-3" /> شحنة</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{totalCartons._sum.cartonsLoaded ?? 0}</p>
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Boxes className="h-3 w-3" /> كرتون</p>
            </div>
          </div>

          <div className="rounded-lg bg-primary/10 p-3 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">المحطة القادمة / الحالية</p>
              <p className="font-semibold">{currentStop?.branch.name}</p>
            </div>
          </div>

          <Button asChild className="w-full h-12 text-base">
            <Link href={`/driver/trip/${trip.id}`}>عرض تفاصيل الرحلة</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
