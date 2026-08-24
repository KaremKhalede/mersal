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

  /*
    Everything still open on this trip — loaded or not.

    This used to require `loadedAt: { not: null }`, which quietly made one of the four problem types
    unreportable: "شحنة لم تُحمّل" can only ever be true of a shipment that was NOT loaded, and those
    were the exact rows the query excluded. A driver standing at a branch where a listed shipment is
    not there had no way to say so — the option existed in the menu and matched nothing in the list.

    `unloadedAt: null` is the right boundary: a shipment already taken off the truck is finished
    business for this trip.
  */
  const links = await prisma.tripShipmentStop.findMany({
    where: { tripId: id, unloadedAt: null },
    include: { shipment: { include: { cartons: { orderBy: { cartonIndex: "asc" }, select: { id: true, cartonIndex: true, cartonCode: true } } } } },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/driver/trip/${id}`} className="text-muted-foreground"><ChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-lg font-bold">الإبلاغ عن مشكلة</h1>
      </div>
      {/* Cartons come down with the shipments so "which carton is missing" is a tap, not a number
          the driver has to translate into an index the server then guesses back. */}
      <ReportProblemForm
        tripId={id}
        shipments={links.map((l) => ({
          id: l.shipment.id,
          shipmentNumber: l.shipment.shipmentNumber,
          totalCartons: l.shipment.totalCartons,
          cartons: l.shipment.cartons,
          // Which problems can truthfully be reported about this shipment depends on whether it is
          // actually on the truck — see PROBLEM_TYPES in the form.
          loaded: l.loadedAt !== null,
        }))}
      />
    </div>
  );
}
