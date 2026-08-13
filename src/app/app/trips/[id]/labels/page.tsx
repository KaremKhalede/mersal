import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getTripCartonsForLabels } from "@/modules/trips/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/labels/print-button";
import { CartonLabel } from "@/components/labels/carton-label";
import QRCode from "qrcode";

export default async function TripLabelsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "trips", "view");
  const { id } = await params;
  const data = await getTripCartonsForLabels(user.companyId!, id, getBranchScope(user));
  if (!data) notFound();

  const cartons = await Promise.all(
    data.shipments.flatMap((shipment) =>
      shipment.cartons.map(async (carton) => ({
        carton,
        shipment,
        qrSvg: await QRCode.toString(carton.cartonCode, { type: "svg", margin: 0, width: 64 }),
      }))
    )
  );

  return (
    <div className="p-4">
      <div className="print:hidden mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">ملصقات الرحلة {data.trip.tripNumber} ({cartons.length})</h2>
        <PrintButton />
      </div>
      {cartons.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">لا توجد شحنات مرتبطة بهذه الرحلة بعد</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 print:grid-cols-2">
          {cartons.map(({ carton, shipment, qrSvg }) => (
            <CartonLabel
              key={carton.id}
              companyName={user.company!.name}
              shipmentNumber={shipment.shipmentNumber}
              cartonIndex={carton.cartonIndex}
              totalCartons={shipment.totalCartons}
              loadBranchName={shipment.loadBranch.name}
              unloadBranchName={shipment.unloadBranch.name}
              receiverName={shipment.receiverName}
              receiverPhone={shipment.receiverPhone}
              cartonCode={carton.cartonCode}
              qrSvg={qrSvg}
            />
          ))}
        </div>
      )}
    </div>
  );
}
