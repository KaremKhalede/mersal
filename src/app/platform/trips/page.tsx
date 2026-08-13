import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const TRIP_STATUS_LABELS: Record<string, string> = { PLANNED: "مجدولة", IN_PROGRESS: "في الطريق", COMPLETED: "مكتملة", CANCELLED: "ملغاة" };

export default async function PlatformTripsPage() {
  await requirePlatformAdmin();
  const trips = await prisma.trip.findMany({
    include: { company: true, driver: true, stops: { include: { branch: true }, orderBy: { sequence: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">الرحلات ({trips.length})</h2>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الرحلة</TableHead>
                <TableHead>الشركة</TableHead>
                <TableHead>المسار</TableHead>
                <TableHead>السائق</TableHead>
                <TableHead>الحالة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.tripNumber}</TableCell>
                  <TableCell>{t.company.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{t.stops.map((s) => s.branch.name).join(" ← ")}</TableCell>
                  <TableCell>{t.driver?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{TRIP_STATUS_LABELS[t.status]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
