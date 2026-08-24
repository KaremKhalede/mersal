import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LookupForm } from "../lookup-form";
import { TrackShell } from "../track-shell";
import { resolvePublicCarrier } from "../tenant";
import { Assurances } from "../assurances";
import { ContactRow, PhoneRow, EmailRow, WhatsAppGlyph } from "../contact-row";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

/**
 * A carrier's own tracking page — and the reason there is not one of these per carrier.
 *
 * `[company]` is a URL segment, resolved to a row. One route, one component, one UX; the tenant is
 * data. Adding a carrier to the platform adds no file, no route and no deploy — it adds a row whose
 * slug already works here.
 *
 * The carrier's identity (name, brand colour, logo, contact) comes from that row and is rendered by
 * the same TrackShell every other public screen uses, so no carrier can drift into a different
 * product. Chargee's own name appears nowhere: a customer of "مؤسسة النور" has a relationship with
 * that office, not with the software underneath it.
 *
 * An unknown or suspended slug is a plain 404 — a switched-off tenant stops serving a branded page
 * along with everything else.
 */
export async function generateMetadata({ params }: { params: Promise<{ company: string }> }): Promise<Metadata> {
  const { company } = await params;
  const carrier = await resolvePublicCarrier(company);
  if (!carrier) return { title: "تتبّع شحنة" };
  return {
    title: `تتبّع شحنة — ${carrier.name}`,
    description: `تابع حالة شحنتك لدى ${carrier.name} برقم الشحنة وآخر 4 أرقام من جوال المستلم.`,
  };
}

export default async function CarrierTrackPage({ params }: { params: Promise<{ company: string }> }) {
  const { company } = await params;
  const carrier = await resolvePublicCarrier(company);
  if (!carrier) notFound();

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
          تابع حالة شحنتك لدى {carrier.name} خطوة بخطوة، بلا حساب وبلا كلمة مرور.
        </p>
      </section>

      <div className="track-rise track-delay-3 mx-auto mt-8 w-full max-w-2xl">
        {/* The slug rides with the submit and is re-checked server-side against the shipment's real
            owner — this page must never render another carrier's shipment. */}
        <LookupForm companySlug={carrier.slug} />
      </div>

      <Assurances />

      {(carrier.phone || carrier.email) && <CarrierContact carrier={carrier} />}
    </TrackShell>
  );
}

/** The carrier's own contact, not the platform's — this is its page. Rendered only for what the
 *  office has actually filled in; an empty row on a customer-facing screen is worse than none.
 *  Uses the same rows as the fallback band, so a formatted number and a real glyph are not
 *  something one of the two pages happens to get right. */
function CarrierContact({ carrier }: { carrier: { name: string; phone: string | null; email: string | null } }) {
  return (
    <section className="track-reveal mt-14" aria-labelledby="carrier-contact">
      <h2 id="carrier-contact" className="text-center text-base font-bold" style={{ color: "var(--navy-900)" }}>
        لم تجد شحنتك؟ تواصل مع {carrier.name}
      </h2>
      <div className="track-card mx-auto mt-5 grid max-w-2xl grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {carrier.phone && <PhoneRow phone={carrier.phone} hint="اتصال هاتفي" />}
        {carrier.phone && (
          <ContactRow
            icon={<WhatsAppGlyph />}
            // wa.me wants digits only, no "+".
            href={`https://wa.me/${(normalizePhone(carrier.phone) ?? carrier.phone).replace(/\D/g, "")}`}
            label={formatPhoneDisplay(carrier.phone)}
            hint="واتساب"
            external
          />
        )}
        {carrier.email && <EmailRow email={carrier.email} />}
      </div>
    </section>
  );
}
