import { Quote } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";
import { testimonials } from "../../data/content";

export default function Testimonials() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="relative py-24 sm:py-28 bg-[var(--bg-light)]">
      <div className="container-px mx-auto max-w-7xl">
        <div className="text-center max-w-2xl mx-auto">
          <Reveal>
            <span className="pill-badge">آراء تجريبية</span>
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
              تجربة أبسط، رؤية أوضح، وتشغيل <span className="brand-gradient-text">أكثر تنظيمًا</span>
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-4 text-[var(--text-secondary)] leading-7">
              نماذج تعريفية توضح الأسلوب المتوقع لآراء العملاء — يمكن استبدالها لاحقًا بشهادات حقيقية.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <Reveal key={i} index={i}>
              <div className="card-elevate h-full rounded-2xl bg-white border border-[var(--border)] p-7 relative">
                <Quote className="text-[var(--orange)]/25" size={36} />
                <p className="mt-4 text-[var(--navy)] leading-8 font-medium">{t.quote}</p>
                <div className="mt-6 pt-5 border-t border-[var(--border)] flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--soft-blue)] font-bold text-[var(--blue)]">
                    {t.name.charAt(0)}
                  </span>
                  <div>
                    <p className="font-bold text-[var(--navy)] text-sm">{t.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {t.role} — {t.company}
                    </p>
                  </div>
                </div>
                <span className="absolute top-4 left-4 text-[0.6rem] font-bold uppercase tracking-wide text-[var(--text-secondary)]/60 bg-[var(--bg-light)] px-2 py-1 rounded-full">
                  نموذج تجريبي
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
