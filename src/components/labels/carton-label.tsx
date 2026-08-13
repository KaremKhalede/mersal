/** One physical carton label — shared by the single-shipment label page and the trip-level bulk
 * label page so both print identical output. Shipment number stays the dominant visual element;
 * the QR (Phase 5 P1 batch 1) encodes cartonCode and sits below it, unchanged from that batch. */
export function CartonLabel({
  companyName,
  shipmentNumber,
  cartonIndex,
  totalCartons,
  loadBranchName,
  unloadBranchName,
  receiverName,
  receiverPhone,
  cartonCode,
  qrSvg,
}: {
  companyName: string;
  shipmentNumber: string;
  cartonIndex: number;
  totalCartons: number;
  loadBranchName: string;
  unloadBranchName: string;
  receiverName: string;
  receiverPhone: string;
  cartonCode: string;
  qrSvg: string;
}) {
  return (
    <div className="break-inside-avoid rounded-lg border-2 border-foreground p-4 text-center space-y-1" dir="rtl">
      <p className="font-bold text-base">{companyName}</p>
      <p className="text-2xl font-extrabold tracking-wide" dir="ltr">{shipmentNumber}</p>
      <p className="text-lg font-bold">كرتون {cartonIndex} / {totalCartons}</p>
      <p className="text-sm">{loadBranchName} ← {unloadBranchName}</p>
      <p className="text-sm font-medium">{receiverName}</p>
      <p className="text-sm" dir="ltr">{receiverPhone}</p>
      <p className="text-xs text-muted-foreground" dir="ltr">{cartonCode}</p>
      <div
        data-testid="carton-qr"
        data-qr-value={cartonCode}
        className="flex justify-center pt-1 [&>svg]:w-16 [&>svg]:h-16"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
    </div>
  );
}
