import { requireCompanyUser } from "@/lib/auth";
import { requireCan } from "@/lib/rbac";
import { getShipmentDetail } from "@/modules/shipments/service";
import { getBranchScope } from "@/lib/branch-scope";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { CartonPrintPanel } from "@/components/labels/carton-print-panel";
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
  );

  return (
    <div className="space-y-4 p-4 print:p-0">
      <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
        <Link href={`/app/shipments/${shipment.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" /> رجوع إلى الشحنة
        </Link>
      </div>

      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground print:hidden">
        <Link href="/app/shipments" className="hover:text-foreground">الشحنات</Link>
        <ChevronLeft className="h-3.5 w-3.5" />
        <span>طباعة أكواد الكراتين</span>
        <ChevronLeft className="h-3.5 w-3.5" />
        <Link href={`/app/shipments/${shipment.id}`} className="font-medium text-primary hover:underline" dir="ltr">
          {shipment.shipmentNumber}
        </Link>
      </nav>

      <CartonPrintPanel companyName={user.company!.name} cartons={cartons} />
    </div>
  );
}
