"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shell/action-button";
import { CheckCircle2, PackageCheck, Boxes, Printer, Ban } from "lucide-react";
import { receiveShipmentAction, markReadyForPickupAction, confirmBranchPickupAction, confirmRemainingArrivedAction, cancelShipmentAction } from "../actions";
import { PaymentDialog } from "./payment-dialog";
import { ExceptionDialog } from "./exception-dialog";
import { EditShipmentDialog } from "./edit-shipment-dialog";

type Shipment = {
  id: string;
  status: string;
  amountPaid: number;
  shippingPrice: number | null;
  receiverName: string;
  receiverPhone: string;
  goodsType: string | null;
  weightKg: number | null;
  notes: string | null;
};

export function ShipmentActions({ shipment }: { shipment: Shipment }) {
  const canRaiseException = !["DELIVERED", "CANCELLED", "EXCEPTION"].includes(shipment.status);
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
      {shipment.status === "ARRIVED" && (
        <ActionButton icon={CheckCircle2} action={() => markReadyForPickupAction(shipment.id)} successMessage="أصبحت جاهزة للاستلام">
          وضع جاهزة للاستلام
        </ActionButton>
      )}
      {shipment.status === "READY_FOR_PICKUP" && (
        <ActionButton
          icon={CheckCircle2}
          variant="default"
          action={() => confirmBranchPickupAction(shipment.id)}
          confirmMessage="تأكيد استلام العميل للشحنة من الفرع؟"
          successMessage="تم تسليم الشحنة"
        >
          تسليم من الفرع
        </ActionButton>
      )}
      <Button size="sm" variant="outline" asChild>
        <Link href={`/app/shipments/${shipment.id}/label`} target="_blank"><Printer className="h-4 w-4" /> طباعة الملصقات</Link>
      </Button>
      <PaymentDialog shipmentId={shipment.id} amountPaid={shipment.amountPaid} shippingPrice={shipment.shippingPrice} />
      {canRaiseException && <ExceptionDialog shipmentId={shipment.id} />}
    </div>
  );
}
