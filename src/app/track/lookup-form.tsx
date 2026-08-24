"use client";

import { useState, useTransition } from "react";
import { Search, AlertCircle, ArrowRight, Package, Smartphone, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lookupShipmentAction } from "./actions";
import { TrackingView } from "./tracking-view";
import type { TrackedShipment } from "./tracked-shipment";
import type { PublicCarrier } from "./tenant";

/**
 * The public "where is my shipment" form, and the result it renders in place.
 *
 * ## Why the result is rendered here instead of redirecting
 *
 * Redirecting on success would mean sending the customer to /track/<token> — which puts the
 * tracking token, the credential that authorizes redirecting real cartons, into the URL of anyone
 * who guessed a sequential shipment number. See src/app/track/actions.ts for the full reasoning.
 * The action returns a view model with no token in it, and this component renders the same card
 * the token route renders, minus the controls that move goods.
 *
 * A client component for one reason: a Server Action's return value needs somewhere to live. The
 * card itself (TrackingView) stays a plain shared component, so the two entry points cannot drift.
 *
 * ## Why the two inputs are controlled
 *
 * React 19 resets an uncontrolled form after its action completes — including when the action comes
 * back with an error. On a failed lookup that wiped both fields, so a customer who mistyped one
 * digit of a shipment number had to retype the whole thing, on a phone, having just been told they
 * got it wrong. Holding the values in state keeps them exactly where the customer left them; the
 * correction is one character, which is what the mistake was.
 *
 * ## The visual pass
 *
 * Restyled to the navy tracking surface (./track.css) — the markup and every line of behaviour
 * below is unchanged. The submit path, the error handling and the deliberate absence of the
 * pickup/delivery controls are load-bearing security decisions, not styling.
 */
export function LookupForm({
  companySlug,
  initialShipmentNumber = "",
}: {
  /** Set on the branded door. Travels with the submit as a tenant fence the server re-checks — the
   *  client is never trusted to have scoped anything. */
  companySlug?: string;
  /** Pre-filled from /track/<company>/<shipmentNumber>. The number is a reference a carrier may
   *  print or send; it is never a credential, so pre-filling it changes nothing about what the
   *  visitor still has to know. */
  initialShipmentNumber?: string;
}) {
  const [shipmentNumber, setShipmentNumber] = useState(initialShipmentNumber);
  const [last4, setLast4] = useState("");
  const [result, setResult] = useState<{ shipment: TrackedShipment; carrier: PublicCarrier } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      const outcome = await lookupShipmentAction(formData);
      if ("error" in outcome) {
        setError(outcome.error);
        setResult(null);
        return;
      }
      setError(null);
      setResult({ shipment: outcome.shipment, carrier: outcome.carrier });
    });
  }

  if (result) {
    return (
      <div className="space-y-4">
        <TrackingView
          shipment={result.shipment}
          carrier={result.carrier}
          // Only on the unbranded door: there the surrounding shell has no carrier, so the card is
          // the one place the customer can learn whose office is holding their shipment. On a
          // carrier's own page the bar already says it.
          showCarrier={!companySlug}
          // No `actions`: choosing pickup or requesting home delivery are authorized by the
          // tracking token, and this path never had one. The footnote says where those controls
          // live rather than leaving a customer wondering why the buttons are missing.
          footnote={
            ["ARRIVED", "PARTIALLY_ARRIVED", "READY_FOR_PICKUP"].includes(result.shipment.status) ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                لتغيير طريقة الاستلام (استلام من الفرع أو توصيل إلى العنوان)، استخدم رابط التتبع
                المُرسل إليك عبر واتساب
                {result.carrier.phone ? " أو اتصل بالشركة على الرقم أعلاه." : "."}
              </p>
            ) : undefined
          }
        />
        <Button variant="outline" className="w-full" onClick={() => setResult(null)}>
          <ArrowRight className="h-4 w-4" /> تتبع شحنة أخرى
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <form action={submit} className="track-card space-y-4 p-5 sm:p-6">
        {/* Re-checked server-side against the shipment's real owner — see lookupShipmentAction. */}
        {companySlug && <input type="hidden" name="companySlug" value={companySlug} />}
        <Field
          id="shipmentNumber"
          name="shipmentNumber"
          label="رقم الشحنة"
          placeholder="SH-100482"
          value={shipmentNumber}
          onChange={setShipmentNumber}
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
        />
        <Field
          id="last4"
          name="last4"
          label="آخر 4 أرقام من جوال المستلم"
          placeholder="4567"
          value={last4}
          onChange={setLast4}
          icon={<Smartphone className="h-4 w-4" aria-hidden="true" />}
          // inputMode numeric brings up the digit keypad without type="number", which on a phone
          // adds spinners and silently strips leading zeros — and "0512" is a real answer here.
          inputMode="numeric"
          maxLength={8}
        />

        {error && (
          // aria-live so the message is announced to a screen reader: it appears after a round trip,
          // with no navigation and no focus change, so nothing else would surface it.
          <p
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 rounded-xl border p-3 text-sm"
            style={{ borderColor: "#f3c9c9", background: "#fdf2f2", color: "#a12b2b" }}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <button type="submit" className="track-submit inline-flex items-center justify-center gap-2" disabled={pending}>
          <Search className="h-4 w-4" aria-hidden="true" />
          {pending ? "جارٍ البحث..." : "تتبّع الشحنة"}
        </button>

        {/*
          The one question this form gets asked, answered in place.

          A customer who has lost the WhatsApp message frequently does not know what "رقم الشحنة"
          refers to — it is on a slip they may have folded into a pocket. A native <details> keeps
          the answer one tap away without pushing the form down the page for everyone else.
        */}
        <details className="track-help border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
          <summary className="flex items-center justify-center gap-1.5 text-sm font-medium" style={{ color: "var(--navy-800)" }}>
            أين تجد رقم الشحنة؟
            <ChevronDown className="track-help__chevron h-4 w-4" aria-hidden="true" />
          </summary>
          <ul className="track-help__body mt-3 space-y-2 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
            <li>· في إيصال الاستلام الذي أعطاك إياه المكتب — يبدأ بـ SH.</li>
            <li>· في رسالة واتساب التي وصلتك عند تسجيل الشحنة.</li>
            <li>· على ملصق الكرتون نفسه، أسفل رمز الاستجابة السريعة.</li>
            <li>· «آخر 4 أرقام» هي أرقام جوال <strong>المستلم</strong> كما سُجّل لدى الشركة، لا جوالك.</li>
          </ul>
        </details>
      </form>
      {/* No staff link here: the header already carries one, and two links to the same place on a
          page with a single job is one more thing for a lost customer to read past. */}
    </div>
  );
}

/** A labelled field with a trailing glyph. The icon is decorative — the <label> is what names the
 *  input, so nothing here depends on recognising a symbol. */
function Field({
  id,
  name,
  label,
  placeholder,
  value,
  onChange,
  icon,
  inputMode,
  maxLength,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon: React.ReactNode;
  inputMode?: "numeric";
  maxLength?: number;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold" style={{ color: "var(--navy-900)" }}>
        {label}
      </label>
      <div className="relative">
        {/* dir="ltr" because the values are "SH-100482" and "4567" — LTR islands in an RTL page.
            autoComplete off: this is not the phone's own data, and a suggestion list dropped over a
            4-digit field is in the way. */}
        <input
          id={id}
          name={name}
          dir="ltr"
          className="track-field"
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          maxLength={maxLength}
          required
        />
        <span
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center"
          style={{ color: "var(--navy-700)" }}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
