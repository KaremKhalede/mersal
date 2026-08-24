import { Phone, Mail } from "lucide-react";
import { formatPhoneDisplay, normalizePhone } from "@/lib/phone";

/**
 * One way to reach someone, as a row.
 *
 * Shared by the carrier's own contact band and the platform's fallback band so the two never drift
 * into two different-looking lists of the same thing. The label is always run through the product's
 * phone formatter — a raw "+967771234567" on a customer-facing page is a number nobody reads back
 * correctly over a counter.
 */
export function ContactRow({
  icon,
  href,
  label,
  hint,
  external,
}: {
  icon: React.ReactNode;
  href: string;
  label: string;
  hint: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="track-contact flex items-center gap-3 rounded-xl border p-3"
      style={{ borderColor: "var(--hairline)" }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: "var(--navy-100)", color: "var(--navy-800)" }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        {/* dir="ltr" on the value only: a phone number or an address is an LTR island in Arabic. */}
        <span className="block truncate text-sm font-semibold" dir="ltr" style={{ color: "var(--navy-900)" }}>
          {label}
        </span>
        <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>
          {hint}
        </span>
      </span>
    </a>
  );
}

/** A phone row, built from a raw stored number. Normalised for the `tel:` href, formatted for the
 *  eye — the two are different jobs and were being conflated. */
export function PhoneRow({ phone, hint }: { phone: string; hint: string }) {
  return (
    <ContactRow
      icon={<Phone className="h-4 w-4" aria-hidden="true" />}
      href={`tel:${normalizePhone(phone) ?? phone}`}
      label={formatPhoneDisplay(phone)}
      hint={hint}
    />
  );
}

export function EmailRow({ email }: { email: string }) {
  return (
    <ContactRow
      icon={<Mail className="h-4 w-4" aria-hidden="true" />}
      href={`mailto:${email}`}
      label={email}
      hint="بريد إلكتروني"
    />
  );
}

/** lucide has no WhatsApp mark, and the brand glyph is the whole point of the row. */
export function WhatsAppGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.86 9.86 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03 0 1.2.87 2.35.99 2.52.12.16 1.71 2.61 4.14 3.66.58.25 1.03.4 1.38.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
    </svg>
  );
}
