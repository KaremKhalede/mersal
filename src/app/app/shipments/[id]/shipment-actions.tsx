"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/shell/action-button";
import { FormDialog } from "@/components/shell/form-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckCircle2, PackageCheck, Boxes, Printer, Ban, Link2, MoreHorizontal, Pencil, Wallet, AlertTriangle, Receipt } from "lucide-react";
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

/** Which of the overflow dialogs is open. One piece of state, not one flag each: they are mutually
 *  exclusive by construction — all of them are opened from the same menu, which closes on select. */
type OpenDialog = "edit" | "exception" | "cancel" | "payment" | null;

/**
 * Three controls, not seven.
 *
 * Every action here was a button of its own, laid out in one wrapping row: on a REGISTERED shipment
 * that was تعديل, إلغاء, استلام الشحنة, طباعة الملصقات, نسخ رابط التتبع, تسجيل دفعة and تسجيل استثناء —
 * seven, of which one was the actual next step in the workflow and one (إلغاء, destructive, pink)
 * was the loudest thing on the screen after the primary. buttonVariants' own docstring says "at
 * most ONE default per screen region"; this row had a default, a destructive and five outlines
 * competing at the same weight.
 *
 * What stays out in the open is now exactly what someone does at a counter with a customer waiting:
 *
 *   - the one move the workflow is asking for next (default),
 *   - تسجيل دفعة, but only while money is actually owed,
 *   - طباعة الملصقات, because it is a physical task done constantly and at any status,
 *   - everything else behind "⋯".
 *
 * Nothing was removed and no action changed what it does — this is placement only. The dialogs in
 * the menu are rendered as siblings of the DropdownMenu and driven by `openDialog`, not nested
 * inside DropdownMenuItems: Radix unmounts the menu the moment an item is selected, and with it any
 * trigger inside, so a nested dialog would never open. (Same reason PaymentDialog already accepted
 * open/onOpenChange for the handover flow.)
 */
export function ShipmentActions({ shipment, canRecordPayment }: { shipment: Shipment; canRecordPayment: boolean }) {
  const canRaiseException = !["DELIVERED", "CANCELLED", "EXCEPTION"].includes(shipment.status);
  const missingCartons = shipment.cartons.filter((c) => c.status === "MISSING");
  const missingCartonCodes = missingCartons.map((c) => c.cartonCode);
  const isDraftOrRegistered = shipment.status === "DRAFT" || shipment.status === "REGISTERED";
  const outstanding = shipment.shippingPrice != null ? Math.max(0, shipment.shippingPrice - shipment.amountPaid) : 0;
  const hasOutstanding = outstanding > 0;
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  function copyTrackingLink() {
    navigator.clipboard.writeText(`${window.location.origin}/track/${shipment.trackingToken}`);
    toast.success("تم نسخ رابط التتبع");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ---- the one next step ------------------------------------------------------------- */}
      {shipment.status === "REGISTERED" && (
        <ActionButton icon={PackageCheck} variant="default" action={() => receiveShipmentAction(shipment.id)} successMessage="تم استلام الشحنة">
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
          and the only alternative used to be claiming the missing ones had turned up. `secondary`
          there rather than `default` — on a partially-arrived shipment both moves are legitimate,
          but only one of them can be the primary, and confirming the rest arrived is the one that
          completes the shipment. */}
      {(shipment.status === "ARRIVED" || shipment.status === "PARTIALLY_ARRIVED") && (
        <ActionButton
          icon={CheckCircle2}
          variant={shipment.status === "PARTIALLY_ARRIVED" ? "secondary" : "default"}
          action={() => markReadyForPickupAction(shipment.id)}
          successMessage="أصبحت جاهزة للاستلام"
        >
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
          outstanding={outstanding}
          onSuccess={outstanding > 0 && canRecordPayment ? () => setOpenDialog("payment") : undefined}
        />
      )}
      {/* The only action a closed-but-short shipment still needs: the missing box turning up. It
          records the carton and nothing else — the handover stays closed. Kept in the open rather
          than in the menu because on a DELIVERED shipment it is the only move left, i.e. it *is*
          the next step. */}
      {shipment.status === "DELIVERED" && missingCartons.length > 0 && (
        <LateCartonDialog shipmentId={shipment.id} missingCartons={missingCartons} />
      )}

      {/* ---- money, while there is any ----------------------------------------------------- */}
      {/* Out in the open only while something is owed; once settled it drops into the menu rather
          than disappearing, so a correction is still one click away. Ungated here exactly as
          before — recordPaymentAction is the gate, and it re-checks regardless. */}
      {hasOutstanding && (
        <Button size="sm" variant="outline" onClick={() => setOpenDialog("payment")}>
          <Wallet className="h-4 w-4" /> تسجيل دفعة
        </Button>
      )}

      {/* ---- the constant physical task ---------------------------------------------------- */}
      <Button size="sm" variant="outline" asChild>
        <Link href={`/app/shipments/${shipment.id}/label`} target="_blank"><Printer className="h-4 w-4" /> طباعة الملصقات</Link>
      </Button>

      {/* ---- everything else --------------------------------------------------------------- */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="outline" aria-label="إجراءات أخرى">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* The customer only ever receives this link through WhatsApp, and that send can fail or
              be deleted. Without a way for the office to hand it over again, a customer who lost the
              message has no route back to their own tracking page. Copies the token URL, never the
              shipment number — the number is not a credential (src/lib/tracking.ts). */}
          <DropdownMenuItem onSelect={copyTrackingLink}>
            <Link2 className="h-4 w-4" /> نسخ رابط التتبع
          </DropdownMenuItem>
          {/* The paper the sender walks out with — what they handed over, and what they still owe.
              In the menu rather than beside "طباعة الملصقات": labels are printed for every shipment
              at every status, a receipt is printed once, at the counter, on the way out. */}
          <DropdownMenuItem asChild>
            <Link href={`/app/shipments/${shipment.id}/receipt`} target="_blank">
              <Receipt className="h-4 w-4" /> طباعة إيصال الاستلام
            </Link>
          </DropdownMenuItem>
          {!hasOutstanding && (
            <DropdownMenuItem onSelect={() => setOpenDialog("payment")}>
              <Wallet className="h-4 w-4" /> تسجيل دفعة
            </DropdownMenuItem>
          )}
          {isDraftOrRegistered && (
            <DropdownMenuItem onSelect={() => setOpenDialog("edit")}>
              <Pencil className="h-4 w-4" /> تعديل البيانات
            </DropdownMenuItem>
          )}
          {/* Separated and red, at the bottom: the two entries that refuse or halt the shipment are
              still one click away, they just cannot be hit on the way to "نسخ رابط التتبع". */}
          {(canRaiseException || isDraftOrRegistered) && <DropdownMenuSeparator />}
          {canRaiseException && (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpenDialog("exception")}>
              <AlertTriangle className="h-4 w-4" /> تسجيل استثناء
            </DropdownMenuItem>
          )}
          {isDraftOrRegistered && (
            <DropdownMenuItem variant="destructive" onSelect={() => setOpenDialog("cancel")}>
              <Ban className="h-4 w-4" /> إلغاء الشحنة
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ---- dialogs the menu opens -------------------------------------------------------- */}
      {/* Outside the DropdownMenu and outside every status branch above. Payment in particular has
          to live out here: confirming a handover changes the status and unmounts the branch that
          offered it, and the handover's own onSuccess opens this immediately afterwards. Payment
          stays a separate action with its own permission and errors — a failed one leaves the
          handover recorded and the shipment unpaid. */}
      <PaymentDialog
        shipmentId={shipment.id}
        amountPaid={shipment.amountPaid}
        shippingPrice={shipment.shippingPrice}
        open={openDialog === "payment"}
        onOpenChange={(o) => setOpenDialog(o ? "payment" : null)}
      />
      {isDraftOrRegistered && (
        <>
          <EditShipmentDialog
            shipment={shipment}
            open={openDialog === "edit"}
            onOpenChange={(o) => setOpenDialog(o ? "edit" : null)}
          />
          {/* A confirm, expressed as the form dialog everything else here uses, so the destructive
              path gets the same footer, the same escape hatch and the same error/toast handling
              instead of a second confirm style. No fields — the question is the whole dialog. */}
          <FormDialog
            open={openDialog === "cancel"}
            onOpenChange={(o) => setOpenDialog(o ? "cancel" : null)}
            title="إلغاء الشحنة"
            description="إلغاء هذه الشحنة قبل بدء تجهيزها؟ لا يمكن التراجع عن هذا الإجراء."
            submitLabel="تأكيد إلغاء الشحنة"
            submitVariant="destructive"
            successMessage="تم إلغاء الشحنة"
            action={() => cancelShipmentAction(shipment.id)}
          >
            <></>
          </FormDialog>
        </>
      )}
      {canRaiseException && (
        <ExceptionDialog
          shipmentId={shipment.id}
          open={openDialog === "exception"}
          onOpenChange={(o) => setOpenDialog(o ? "exception" : null)}
        />
      )}
    </div>
  );
}
