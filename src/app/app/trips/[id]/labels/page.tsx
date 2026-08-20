import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getTripCartonsForLabels } from "@/modules/trips/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { CartonPrintPanel } from "@/components/labels/carton-print-panel";
import QRCode from "qrcode";

export default async function TripLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "view");
  const { id } = await params;
  const data = await getTripCartonsForLabels(user.companyId!, id, getBranchScope(user));
  if (!data) notFound();

  // Flattened to one row per physical carton, each carrying its own shipment's context — cartons in
  // a trip come from different shipments, so route/receiver/number vary card to card. Same QR width
  // as the single-shipment page so both render an identical label.
  const cartons = await Promise.all(
    data.shipments.flatMap((shipment) =>
      shipment.cartons.map(async (carton) => ({
        id: carton.id,
        shipmentNumber: shipment.shipmentNumber,
        cartonIndex: carton.cartonIndex,
        totalCartons: shipment.totalCartons,
        loadBranchName: shipment.loadBranch.name,
        unloadBranchName: shipment.unloadBranch.name,
        receiverName: shipment.receiverName,
        receiverPhone: shipment.receiverPhone,
        cartonCode: carton.cartonCode,
        qrSvg: await QRCode.toString(carton.cartonCode, { type: "svg", margin: 0, width: 88 }),
      }))
    )
  );

  return (
    <div className="space-y-4 p-4 print:p-0">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link href={`/app/trips/${data.trip.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" /> رجوع إلى الرحلة
        </Link>
      </div>

      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground print:hidden">
        <Link href="/app/trips" className="hover:text-foreground">الرحلات</Link>
        <ChevronLeft className="h-3.5 w-3.5" />
        <span>ملصقات الرحلة</span>
        <ChevronLeft className="h-3.5 w-3.5" />
        <Link href={`/app/trips/${data.trip.id}`} className="font-medium text-primary hover:underline" dir="ltr">
          {data.trip.tripNumber}
        </Link>
      </nav>

      <CartonPrintPanel
        companyName={user.company!.name}
        cartons={cartons}
        heading={`ملصقات الرحلة ${data.trip.tripNumber}`}
        emptyMessage="لا توجد شحنات مرتبطة بهذه الرحلة بعد"
      />
    </div>
  );
}
