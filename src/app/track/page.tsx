import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { PLATFORM_ID } from "@/lib/platform";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";
import { LookupForm } from "./lookup-form";
import { TrackShell } from "./track-shell";
import { Assurances } from "./assurances";
import { ContactRow, PhoneRow, EmailRow, WhatsAppGlyph } from "./contact-row";

/**
 * The UNBRANDED fallback — the screen a customer reaches by typing the bare domain.
 *
 * Every carrier has its own branded door at /track/<slug>, and that is the URL an office actually
 * hands out. This one exists for the visitor who has a shipment number and does not know, or cannot
 * remember, which company is holding their goods. There is no carrier to dress it with until the
 * number resolves — the form is the question — so the bar carries the page's purpose and the result
 * card carries whoever turns out to own the shipment.
 *
 * Before this route existed, `/` redirected an anonymous visitor to the staff login page, so a
 * customer who had lost their WhatsApp link arrived at a password field belonging to a company they
 * do not work for. The only way forward was to phone the office, which is the call this product is
 * meant to remove.
 *
 * ---------------------------------------------------------------------------------------------
 * WHOSE BRAND IS ON THIS PAGE
 * ---------------------------------------------------------------------------------------------
 * The PLATFORM's, and it cannot be a carrier's. A visitor arrives here precisely because they
 * cannot tell you who is carrying their goods — that is the question the form answers. The carrier
 * only becomes known once a shipment resolves, which is why its identity (name, brand colour)
 * appears on the RESULT card and nowhere before it.
 *
 * Read-only by design: the form's action returns the tracking card without the tracking token, so
 * this page can never offer the two controls that redirect cartons. See ./actions.ts.
 */
export const metadata: Metadata = {
  title: "تتبّع شحنة",
  description: "أدخل رقم الشحنة وآخر 4 أرقام من جوال المستلم لمتابعة حالة شحنتك.",
};


export default async function TrackLookupPage() {
  // A single-row table, and the only query this page runs before the visitor types anything.
  // `findUnique` rather than `findFirstOrThrow`: a platform row that has not been seeded yet must
  // still render a working lookup form, not a 500 on the one page with no other way in.
  const platform = await prisma.platform.findUnique({
    where: { id: PLATFORM_ID },
    select: { name: true, supportPhone: true, supportWhatsapp: true, supportEmail: true, supportHours: true },
  });

  const phone = platform?.supportPhone?.trim() || null;
  const whatsapp = platform?.supportWhatsapp?.trim() || null;
  const email = platform?.supportEmail?.trim() || null;
  const hasContact = Boolean(phone || whatsapp || email);

  return (
    <TrackShell carrier={null}>
      {/* ---- hero + the form it exists for ---------------------------------------------- */}
      <section className="pt-6 text-center sm:pt-10">
        <h1
          className="track-rise track-delay-1 text-3xl font-extrabold tracking-tight sm:text-[2.6rem]"
          style={{ color: "var(--navy-900)" }}
        >
          تتبّع شحنتك
        </h1>
        <p className="track-rise track-delay-2 mx-auto mt-3 max-w-md text-sm sm:text-base" style={{ color: "var(--ink-soft)" }}>
          تابع حالة شحنتك خطوة بخطوة، بلا حساب وبلا كلمة مرور.
        </p>
      </section>

      {/* Wide enough for the RESULT card, which renders in the same slot — the form keeps its
          own narrower measure inside. A three-column facts row at max-w-md truncated every value
          it was built to state. */}
      <div className="track-rise track-delay-3 mx-auto mt-8 w-full max-w-2xl">
        <LookupForm />
      </div>

      <Assurances />

      {/*
        ---- support -------------------------------------------------------------------
        Rendered only when an operator has actually entered a way to be reached. The design this
        page was rebuilt from carried three placeholder contacts; printing invented numbers on the
        one screen a stranded customer reaches is worse than showing nothing, so the section is
        driven by Platform's own fields and disappears when they are empty.
      */}
      {hasContact && (
        <section className="track-reveal mt-14" aria-labelledby="support-heading">
          <h2 id="support-heading" className="text-center text-base font-bold" style={{ color: "var(--navy-900)" }}>
            لم تجد شحنتك؟ تواصل معنا
          </h2>
          <div className="track-card mt-5 grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {phone && (
              <PhoneRow phone={phone} hint={platform?.supportHours?.trim() || "اتصال هاتفي"} />
            )}
            {whatsapp && (
              <ContactRow
                icon={<WhatsAppGlyph />}
                // wa.me wants digits only, no "+" — the one place a normalised E.164 number has
                // to be un-formatted rather than displayed.
                href={`https://wa.me/${(normalizePhone(whatsapp) ?? whatsapp).replace(/\D/g, "")}`}
                label={formatPhoneDisplay(whatsapp)}
                hint="واتساب"
                external
              />
            )}
            {email && (
              <EmailRow email={email} />
            )}
          </div>
        </section>
      )}
    </TrackShell>
  );
}

