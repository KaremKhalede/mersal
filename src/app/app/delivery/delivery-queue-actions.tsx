"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Truck, CheckCircle2, ShieldCheck, XCircle, Undo2, MoreVertical } from "lucide-react";
import { DeliveryProofDialog } from "@/components/shell/delivery-proof-dialog";
import { PaymentDialog } from "@/app/app/shipments/[id]/payment-dialog";
import { confirmDeliveryRequestAction, markOutForDeliveryAction, markDeliveredAction, failDeliveryAction, cancelDeliveryRequestAction } from "./actions";

export function DeliveryQueueActions({ requestId, shipmentId, status, receiverName, missingCartonCodes, amountPaid, shippingPrice, canRecordPayment }: { requestId: string; shipmentId: string; status: string; receiverName: string; missingCartonCodes: string[]; amountPaid: number; shippingPrice: number | null; canRecordPayment: boolean }) {
  const [pending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const router = useRouter();
  const outstanding = shippingPrice != null ? Math.max(0, shippingPrice - amountPaid) : 0;

  // The handover flips the request to DELIVERED, so the branch that rendered the proof dialog is
  // gone by the time payment is due. Owning the dialog here — outside every status branch — keeps
  // it on screen through that refresh. Payment stays its own action with its own permission: a
  // failed one leaves the delivery recorded and the shipment in the unpaid list.
  return (
    <>
      {actions()}
      {payOpen && (
        <PaymentDialog shipmentId={shipmentId} amountPaid={amountPaid} shippingPrice={shippingPrice} open onOpenChange={setPayOpen} />
      )}
    </>
  );

  function run(action: () => Promise<void | { error?: string }>) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) { toast.error(result.error); return; }
        router.refresh();
        toast.success("تم تحديث حالة التوصيل");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء");
      }
    });
  }

  function actions() {
  // PENDING means the customer asked for delivery from the public tracking page and nothing has
  // been dispatched yet. An employee confirms the address here before any provider call.
  // Cancelling is offered wherever nothing has left the branch yet — a customer changing their mind
  // is far more common than a request turning out to be unreviewable.
  if (status === "PENDING") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => confirmDeliveryRequestAction(requestId, shipmentId))}>
          <ShieldCheck className="h-4 w-4" /> مراجعة وتأكيد الطلب
        </Button>
        <CancelButton requestId={requestId} shipmentId={shipmentId} pending={pending} run={run} />
      </div>
    );
  }

  if (status === "ASSIGNED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => markOutForDeliveryAction(requestId, shipmentId))}>
          <Truck className="h-4 w-4" /> بدء التوصيل
        </Button>
        <CancelButton requestId={requestId} shipmentId={shipmentId} pending={pending} run={run} />
      </div>
    );
  }

  // Same proof dialog as the branch counter — a doorstep handover and a counter handover leave
  // identical evidence, only the recorded channel differs.
  if (status === "OUT_FOR_DELIVERY") {
    return (
      <div className="flex flex-wrap gap-2">
        <DeliveryProofDialog
          trigger={<Button size="sm" disabled={pending}><CheckCircle2 className="h-4 w-4" /> تأكيد التوصيل</Button>}
          title="تأكيد التوصيل"
          receiverName={receiverName}
          missingCartonCodes={missingCartonCodes}
          action={(formData) => markDeliveredAction(requestId, shipmentId, formData)}
          outstanding={outstanding}
          onSuccess={outstanding > 0 && canRecordPayment ? () => setPayOpen(true) : undefined}
        />
        {/* Once a delivery is under way the honest close is "it failed", not "it never happened" —
            and the shipment goes back to being collectable at the branch counter. */}
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => failDeliveryAction(requestId, shipmentId))}>
          <XCircle className="h-4 w-4" /> تعذّر التوصيل
        </Button>
      </div>
    );
  }

  return <span className="text-muted-foreground text-xs">—</span>;
  }
}

/**
 * Shared by the two pre-dispatch states, so "call it off" reads and behaves identically in both.
 *
 * A "⋯" rather than a second visible button: this row already carries the workflow's next step as a
 * primary, and the six list pages now share one rule — the next step stays a button, everything
 * secondary or destructive goes in the menu. Cancelling a request is destructive and rare; it was
 * sitting at the same weight as "مراجعة وتأكيد الطلب", which is the thing the queue exists to do.
 */
function CancelButton({
  requestId,
  shipmentId,
  pending,
  run,
}: {
  requestId: string;
  shipmentId: string;
  pending: boolean;
  run: (action: () => Promise<void | { error?: string }>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-sm" disabled={pending} aria-label="إجراءات أخرى">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={() => run(() => cancelDeliveryRequestAction(requestId, shipmentId))}>
          <Undo2 className="h-4 w-4" /> إلغاء الطلب
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
