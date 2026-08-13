import { requireDriver } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ReportProblemForm } from "./report-problem-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function ReportProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireDriver();
  const { id } = await params;

  const trip = await prisma.trip.findFirst({ where: { id, driverId: user.id } });
  if (!trip) notFound();

  const links = await prisma.tripShipmentStop.findMany({
    where: { tripId: id, loadedAt: { not: null }, unloadedAt: null },
    include: { shipment: true },
  });

  const shipments = links.map((l) => l.shipment);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/driver/trip/${id}`} className="text-muted-foreground"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-lg font-bold">الإبلاغ عن مشكلة</h1>
      </div>
      <ReportProblemForm tripId={id} shipments={shipments.map((s) => ({ id: s.id, shipmentNumber: s.shipmentNumber, totalCartons: s.totalCartons }))} />
    </div>
  );
}
