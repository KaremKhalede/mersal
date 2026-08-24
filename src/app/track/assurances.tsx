import { ShieldCheck, Truck, BellRing, Headset } from "lucide-react";

/**
 * Four promises, each one a fact about how this page actually works — not marketing.
 *
 * Shared by the branded carrier page and the unbranded fallback so the two doors say the same thing
 * about the same product. Deliberately carrier-agnostic: every line is true of the tracking surface
 * itself, so no office has to be asked to write copy before its page can go live.
 */
const ASSURANCES = [
  { icon: ShieldCheck, title: "خصوصية وأمان", body: "لا تظهر بيانات شحنتك إلا لمن يعرف رقمها وجوال المستلم." },
  { icon: Truck, title: "تحديثات فورية", body: "الحالة هي نفسها التي يراها الفرع، لحظة تسجيلها." },
  { icon: BellRing, title: "تنبيهات على واتساب", body: "تصلك رسالة عند كل خطوة مهمة في رحلة شحنتك." },
  { icon: Headset, title: "دعم عند الحاجة", body: "رقم فرع الاستلام يظهر مع نتيجة التتبع." },
] as const;

export function Assurances() {
  return (
    <section className="track-reveal mt-16" aria-labelledby="assurances-heading">
      <h2 id="assurances-heading" className="sr-only">
        ما الذي يوفّره التتبع
      </h2>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
        {ASSURANCES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="track-assurance flex flex-col items-center gap-2.5 text-center">
            <span
              className="track-assurance__icon flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: "var(--navy-100)", color: "var(--navy-800)" }}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold" style={{ color: "var(--navy-900)" }}>
              {title}
            </span>
            <span className="max-w-[15rem] text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              {body}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
