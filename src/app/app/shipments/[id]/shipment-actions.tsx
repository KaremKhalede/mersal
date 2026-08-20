"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shell/action-button";
import { CheckCircle2, PackageCheck, Boxes, Printer, Ban, Link2 } from "lucide-react";
import { toast } from "sonner";
import { receiveShipmentAction, markReadyForPickupAction, confirmRemainingArrivedAction, cancelShipmentAction, confirmBranchPickupAction } from "../actions";
import { DeliveryProofDialog } from "@/components/shell/delivery-proof-dialog";
import { PaymentDialog } from "./payment-dialog";
import { ExceptionDialog } from "./exception-dialog";
import { EditShipmentDialog } from "./edit-shipment-dialog";
import { LateCartonDialog } from "./late-carton-dialog";

type Shipment = {
  id: string;
  status: string;
  trackingToken: string;
  amountPaid: number;
  shippingPrice: number | null;
  receiverName: string;
  receiverPhone: string;
  goodsType: string | null;
  weightKg: number | null;
  notes: string | null;
  cartons: { id: string; cartonIndex: number; cartonCode: string; status: string }[];
};

export function ShipmentActions({ shipment }: { shipment: Shipment }) {
  const canRaiseException = !["DELIVERED", "CANCELLED", "EXCEPTION"].includes(shipment.status);
  const missingCartons = shipment.cartons.filter((c) => c.status === "MISSING");
  const missingCartonCodes = missingCartons.map((c) => c.cartonCode);
  const isDraftOrRegistered = shipment.status === "DRAFT" || shipment.status === "REGISTERED";

  return (
    <div className="flex flex-wrap gap-2">
      {isDraftOrRegistered && (
        <>
          <EditShipmentDialog shipment={shipment} />
          <ActionButton
            icon={Ban}
            variant="destructive"
            action={() => cancelShipmentAction(shipment.id)}
            confirmMessage="إلغاء هذه الشحنة قبل بدء تجهيزها؟"
            successMessage="تم إلغاء الشحنة"
          >
            إلغاء
          </ActionButton>
        </>
      )}
      {shipment.status === "REGISTERED" && (
        <ActionButton icon={PackageCheck} action={() => receiveShipmentAction(shipment.id)} successMessage="تم استلام الشحنة">
          استلام الشحنة
        </ActionButton>
      )}
      {shipment.status === "PARTIALLY_ARRIVED" && (
        <ActionButton
          icon={Boxes}
          variant="default"
          action={() => confirmRemainingArrivedAction(shipment.id)}
          confirmMessage="تأكيد وصول باقي الكراتين المتبقية؟"
          successMessage="تم تأكيد اكتمال الوصول"
        >
          تأكيد وصول الباقي
        </ActionButton>
      )}
      {/* Also offered on PARTIALLY_ARRIVED: the cartons that did arrive are ready for their owner,
          and the only alternative used to be claiming the missing ones had turned up. */}
      {(shipment.status === "ARRIVED" || shipment.status === "PARTIALLY_ARRIVED") && (
        <ActionButton icon={CheckCircle2} action={() => markReadyForPickupAction(shipment.id)} successMessage="أصبحت جاهزة للاستلام">
          وضع جاهزة للاستلام
        </ActionButton>
      )}
      {/* Replaces a bare yes/no confirm: the question that mattered — who is standing here taking
          the cartons — was never asked, so a delivered shipment carried no answer to a dispute. */}
      {shipment.status === "READY_FOR_PICKUP" && (
        <DeliveryProofDialog
          trigger={<Button size="sm"><CheckCircle2 className="h-4 w-4" /> تسليم من الفرع</Button>}
          title="تسليم من الفرع"
          receiverName={shipment.receiverName}
          missingCartonCodes={missingCartonCodes}
          action={(formData) => confirmBranchPickupAction(shipment.id, formData)}
        />
      )}
      {/* The only action a closed-but-short shipment still needs: the missing box turning up. It
          records the carton and nothing else — the handover stays closed. */}
      {shipment.status === "DELIVERED" && missingCartons.length > 0 && (
        <LateCartonDialog shipmentId={shipment.id} missingCartons={missingCartons} />
      )}
      <Button size="sm" variant="outline" asChild>
        <Link href={`/app/shipments/${shipment.id}/label`} target="_blank"><Printer className="h-4 w-4" /> طباعة الملصقات</Link>
      </Button>
      {/* The customer only ever receives this link through WhatsApp, and that send can fail or be
          deleted. Without a way for the office to hand it over again, a customer who lost the
          message has no route back to their own tracking page. Copies the token URL, never the
          shipment number — the number is not a credential (src/lib/tracking.ts). */}
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}/track/${shipment.trackingToken}`);
          toast.success("تم نسخ رابط التتبع");
        }}
      >
        <Link2 className="h-4 w-4" /> نسخ رابط التتبع
      </Button>
      <PaymentDialog shipmentId={shipment.id} amountPaid={shipment.amountPaid} shippingPrice={shipment.shippingPrice} />
      {canRaiseException && <ExceptionDialog shipmentId={shipment.id} />}
    </div>
  );
}
