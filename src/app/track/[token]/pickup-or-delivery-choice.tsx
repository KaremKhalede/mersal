"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Store, Truck, ShieldCheck, ChevronRight } from "lucide-react";
import { publicRequestDeliveryAction, publicChoosePickupAction } from "./actions";

/**
 * Reading this page needs nothing. Changing where the cartons go needs the last 4 digits of the
 * receiver's phone, because a tracking link is a WhatsApp message and WhatsApp messages get
 * forwarded (see src/lib/tracking.ts).
 *
 * The field is asked for at the moment of the action rather than gating the whole page, so a
 * customer who only wants to look never types anything, and the one who is choosing types four
 * digits they know by heart.
 */
export function PickupOrDeliveryChoice({
  token,
  deliveryMethod,
  hasPendingRequest,
}: {
  token: string;
  deliveryMethod: string | null;
  hasPendingRequest: boolean;
}) {
  const [mode, setMode] = useState<"choose" | "pickup" | "delivery">("choose");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Controlled on purpose. React 19 resets an uncontrolled <form action={...}> once the action
  // resolves — including when it resolves with a validation error — which wiped the address and the
  // digits the customer had just typed every time the code was wrong. Retyping a full address on a
  // phone after one mistyped digit is exactly the friction this page cannot afford.
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [last4, setLast4] = useState("");

  if (deliveryMethod === "PICKUP") {
    return <p className="pt-2 text-center text-sm font-medium text-success">تم اختيار الاستلام من الفرع — بانتظار زيارتك</p>;
  }
  // The request already exists; the page renders its status separately. Offering the form again
  // would only produce a rejected duplicate.
  if (hasPendingRequest) return null;

  function submit(action: (fd: FormData) => Promise<{ error?: string }>, successMessage: string) {
    return (formData: FormData) =>
      startTransition(async () => {
        const result = await action(formData);
        if (result?.error) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        router.refresh();
      });
  }

  const last4Field = (
    <div className="space-y-1.5">
      <label htmlFor="last4" className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck className="h-4 w-4 text-primary" /> آخر 4 أرقام من جوال المستلم
      </label>
      <Input
        id="last4"
        name="last4"
        required
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="0000"
        className="text-center tracking-[0.4em]"
        value={last4}
        onChange={(e) => setLast4(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">للتأكد أنك صاحب الشحنة قبل تغيير طريقة الاستلام.</p>
    </div>
  );

  if (mode === "delivery") {
    return (
      <form action={submit(publicRequestDeliveryAction.bind(null, token), "تم إرسال طلب التوصيل")} className="space-y-3 border-t pt-3">
        <BackLink onClick={() => setMode("choose")} />
        <p className="text-sm font-medium">عنوان التوصيل</p>
        <Textarea
          name="destinationAddress"
          required
          rows={2}
          placeholder="الحي، الشارع، أقرب معلم..."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Textarea
          name="notes"
          rows={1}
          placeholder="ملاحظات (اختياري)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {last4Field}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "جارٍ الإرسال..." : "تأكيد طلب التوصيل"}
        </Button>
      </form>
    );
  }

  if (mode === "pickup") {
    return (
      <form action={submit(publicChoosePickupAction.bind(null, token), "تم اختيار الاستلام من الفرع")} className="space-y-3 border-t pt-3">
        <BackLink onClick={() => setMode("choose")} />
        <p className="text-sm font-medium">تأكيد الاستلام من الفرع</p>
        {last4Field}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "جارٍ التأكيد..." : "تأكيد"}
        </Button>
      </form>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-3 border-t pt-3">
      <Button variant="outline" className="h-14 flex-col gap-1" onClick={() => setMode("pickup")}>
        <Store className="h-5 w-5" /> استلام من الفرع
      </Button>
      <Button className="h-14 flex-col gap-1" onClick={() => setMode("delivery")}>
        <Truck className="h-5 w-5" /> توصيل للمنزل
      </Button>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      <ChevronRight className="h-3.5 w-3.5" /> رجوع للخيارات
    </button>
  );
}
