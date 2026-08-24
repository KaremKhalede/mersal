import Link from "next/link";
import { PackageSearch } from "lucide-react";
import type { PublicCarrier } from "./tenant";
import "./track.css";

/**
 * The chrome around every public tracking screen.
 *
 * ---------------------------------------------------------------------------------------------
 * WHOSE PAGE THIS IS
 * ---------------------------------------------------------------------------------------------
 * The CARRIER's. Chargee is the SaaS underneath and stays there: a customer of "مؤسسة النور للشحن"
 * has a relationship with that office, not with the platform running its software, and a
 * white-label product that puts its own mark on the customer-facing page is not white-label.
 *
 * An earlier pass had this backwards — the platform's name in the bar, the carrier relegated to a
 * strip inside the result card. That is the wrong way round for every visitor who arrives with a
 * carrier's link, which is nearly all of them.
 *
 * `carrier` is null on exactly one route: /track, the fallback lookup for someone who does not know
 * which company is holding their goods. There is no carrier to show yet — that is the question the
 * form answers — so the bar carries the page's purpose instead of anyone's brand.
 *
 * One component, one UX, one set of markup. The tenant is data.
 */
export function TrackShell({
  carrier,
  children,
}: {
  carrier: PublicCarrier | null;
  children: React.ReactNode;
}) {
  return (
    <div className="track-page flex min-h-screen flex-col" dir="rtl">
      <header className="track-rise mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <BrandMark carrier={carrier} />

        {/* Staff need a way in from the bare domain, which lands on tracking. A quiet text link on
            purpose: employees are a rounding error next to the customers this page serves, and they
            can bookmark. (The mockup's language switcher is deliberately absent — the product ships
            in Arabic only, and a control that changes nothing is worse than none.) */}
        <a
          href="/login"
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white"
          style={{ color: "var(--ink-soft)" }}
        >
          دخول الموظفين
        </a>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 pb-16 sm:px-8">{children}</main>

      {/*
        The footer names the carrier too. Deliberately without the mockup's "الشروط والأحكام" /
        "سياسة الخصوصية" links: neither page exists, and a link to a 404 on the one screen a
        stranded customer reaches is worse than no link.
      */}
      <footer
        className="mt-auto px-5 py-6 text-center text-xs sm:px-8"
        style={{ background: "var(--navy-900)", color: "rgba(255,255,255,0.72)" }}
      >
        <p>
          جميع الحقوق محفوظة © {new Date().getFullYear()} {carrier?.name ?? "خدمة تتبّع الشحنات"}
        </p>
        <p className="mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
          جميع الأوقات بالتوقيت المحلي
        </p>
      </footer>
    </div>
  );
}

function BrandMark({ carrier }: { carrier: PublicCarrier | null }) {
  if (!carrier) {
    // No carrier known yet — /track only. The bar states what the page is for rather than borrowing
    // an identity that does not apply to the visitor.
    return (
      <span className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--navy-100)", color: "var(--navy-800)" }}
        >
          <PackageSearch className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-extrabold leading-tight" style={{ color: "var(--navy-900)" }}>
            تتبّع شحنة
          </span>
          <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
            أدخل رقم الشحنة لمتابعتها
          </span>
        </span>
      </span>
    );
  }

  return (
    <Link
      href={`/track/${carrier.slug}`}
      className="group flex items-center gap-3 rounded-xl"
      aria-label={`${carrier.name} — تتبّع شحنة`}
    >
      {/*
        The uploaded mark when there is one, the colour tile when there is not.

        Both are the carrier's own: `logoColor` is picked in its settings and already prints on the
        trip manifest, and the logo is served by a public, read-only route (see
        /api/track/logo/[slug]) because this page has no session to resolve it from.

        A plain <img>, not next/image: these bytes come from tenant uploads at unknown dimensions,
        the optimiser would need every carrier's host allow-listed, and one small brand mark is not
        where a customer's connection is spent.
      */}
      {carrier.hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/track/logo/${carrier.slug}`}
          alt=""
          width={44}
          height={44}
          className="h-11 w-11 shrink-0 rounded-xl object-contain transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100"
          style={{ background: "#fff" }}
        />
      ) : (
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white transition-transform group-hover:scale-105 motion-reduce:group-hover:scale-100"
          style={{ backgroundColor: carrier.logoColor }}
        >
          {carrier.name.trim().slice(0, 1)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-base font-extrabold leading-tight" style={{ color: "var(--navy-900)" }}>
          {carrier.name}
        </span>
        <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
          تتبّع شحنتك بثقة
        </span>
      </span>
    </Link>
  );
}
