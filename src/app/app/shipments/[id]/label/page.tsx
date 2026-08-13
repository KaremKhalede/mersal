import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getShipmentDetail } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/labels/print-button";
import { CartonLabel } from "@/components/labels/carton-label";
import QRCode from "qrcode";

export default async function ShipmentLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCompanyUser();
  requireCan(user, "shipments", "view");
  const { id } = await params;
  const shipment = await getShipmentDetail(user.companyId!, id, getBranchScope(user));
  if (!shipment) notFound();

  // QR payload is exactly the carton's own cartonCode (e.g. "SH-10482-C1") — the same
  // machine-readable identifier the schema already reserves for exception lookup, plain text, no
  // URL. Purely for quickly identifying one physical carton among many during exception
  // resolution — never required for normal driver bulk load/unload operations.
  const cartons = await Promise.all(
    shipment.cartons.map(async (carton) => ({
      ...carton,
      qrSvg: await QRCode.toString(carton.cartonCode, { type: "svg", margin: 0, width: 64 }),
    }))
  );

  return (
    <div className="p-4">
      <div className="print:hidden mb-4">
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-4 print:grid-cols-2">
        {cartons.map((carton) => (
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
            qrSvg={carton.qrSvg}
          />
        ))}
      </div>
    </div>
  );
}
