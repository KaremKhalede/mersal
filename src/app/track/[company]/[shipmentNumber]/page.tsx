import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LookupForm } from "../../lookup-form";
import { TrackShell } from "../../track-shell";
import { resolvePublicCarrier } from "../../tenant";
import { Assurances } from "../../assurances";

/**
 * A deep link to one shipment on its carrier's page — the URL an office prints on a receipt or
 * pastes into a message.
 *
 * ---------------------------------------------------------------------------------------------
 * THIS URL IS AN ADDRESS, NOT A KEY
 * ---------------------------------------------------------------------------------------------
 * It renders the carrier's page with the number already in the field, and then asks for the last
 * four digits of the receiver's phone exactly as the empty form does. Nothing about this route
 * reads a shipment.
 *
 * The distinction is the whole security model. `shipmentNumber` comes from a Postgres sequence, so
 * SH-100001, SH-100002 … are all valid guesses (src/lib/ids.ts accepts that openly, on the grounds
 * that the number grants nothing). If reaching this URL disclosed a shipment, anyone could walk a
 * carrier's entire book — receivers, routes, statuses — and, with the last-four they would then
 * hold, reach the actions that physically redirect cartons. That is precisely the hole
 * src/lib/tracking.ts was written to close.
 *
 * So the number stays what it has always been: a public reference the customer already has printed
 * on their receipt. Pre-filling it saves typing and discloses nothing that was not already in their
 * hand.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ company: string; shipmentNumber: string }>;
}): Promise<Metadata> {
  const { company } = await params;
  const carrier = await resolvePublicCarrier(company);
  return { title: carrier ? `تتبّع شحنة — ${carrier.name}` : "تتبّع شحنة" };
}

export default async function CarrierShipmentPage({
  params,
}: {
  params: Promise<{ company: string; shipmentNumber: string }>;
}) {
  const { company, shipmentNumber } = await params;
  const carrier = await resolvePublicCarrier(company);
  if (!carrier) notFound();

  // Decoded and capped, never queried. Anything longer than a real number is a probe, and the form
  // would refuse it anyway — this only keeps it from being echoed into the field.
  const prefilled = decodeURIComponent(shipmentNumber).trim().slice(0, 40);

  return (
    <TrackShell carrier={carrier}>
      <section className="pt-6 text-center sm:pt-10">
        <h1
          className="track-rise track-delay-1 text-3xl font-extrabold tracking-tight sm:text-[2.6rem]"
          style={{ color: "var(--navy-900)" }}
        >
          تتبّع شحنتك
        </h1>
        <p className="track-rise track-delay-2 mx-auto mt-3 max-w-md text-sm sm:text-base" style={{ color: "var(--ink-soft)" }}>
          أدخل آخر 4 أرقام من جوال المستلم لعرض حالة الشحنة.
        </p>
      </section>

      <div className="track-rise track-delay-3 mx-auto mt-8 w-full max-w-2xl">
        <LookupForm companySlug={carrier.slug} initialShipmentNumber={prefilled} />
      </div>

      <Assurances />
    </TrackShell>
  );
}
