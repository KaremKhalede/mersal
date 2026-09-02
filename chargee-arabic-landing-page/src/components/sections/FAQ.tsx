import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";
import { faqs } from "../../data/content";

const IMG =
  "https://images.pexels.com/photos/8360517/pexels-photo-8360517.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=800";

export default function FAQ() {
  const ref = useReveal<HTMLDivElement>();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" ref={ref} className="relative py-24 sm:py-28 bg-[var(--bg-light)]">
      <div className="container-px mx-auto max-w-7xl">
        <div className="text-center max-w-2xl mx-auto">
          <Reveal>
            <span className="pill-badge">الأسئلة الشائعة</span>
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
              أسئلة يتكرر <span className="brand-gradient-text">طرحها</span>
            </h2>
          </Reveal>
        </div>

        <div className="mt-14 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-start">
          <div className="space-y-3.5">
            {faqs.map((item, i) => {
              const open = openIndex === i;
              return (
                <Reveal key={item.q} index={i}>
                  <div
                    className={`rounded-2xl border bg-white transition-colors ${
                      open ? "border-[var(--orange)]/50" : "border-[var(--border)]"
                    }`}
                  >
                    <h3>
                      <button
                        onClick={() => setOpenIndex(open ? null : i)}
                        aria-expanded={open}
                        aria-controls={`faq-panel-${i}`}
                        className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4.5 text-right"
                      >
                        <span className="font-bold text-[var(--navy)]">{item.q}</span>
                        <span
                          className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                            open ? "bg-[var(--orange)] text-white" : "bg-[var(--bg-light)] text-[var(--navy)]"
                          }`}
                        >
                          {open ? <Minus size={15} /> : <Plus size={15} />}
                        </span>
                      </button>
                    </h3>
                    <div
                      id={`faq-panel-${i}`}
                      className="grid transition-all duration-300 ease-out"
                      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
                    >
                      <div className="overflow-hidden">
                        <p className="px-5 sm:px-6 pb-5 text-[var(--text-secondary)] leading-7">{item.a}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal index={2} className="relative hidden lg:block">
            <div className="rounded-[1.75rem] overflow-hidden shadow-[0_25px_60px_-20px_rgba(11,35,72,0.35)]">
              <img src={IMG} alt="شاحنة شحن على الطريق عند الفجر" className="w-full h-[460px] object-cover" loading="lazy" />
            </div>
            <div className="animate-float absolute -bottom-6 -right-6 bg-white rounded-2xl shadow-[0_20px_45px_-15px_rgba(11,35,72,0.3)] border border-[var(--border)] px-5 py-4">
              <p className="text-xs text-[var(--text-secondary)]">لم تجد إجابتك؟</p>
              <p className="text-sm font-bold text-[var(--navy)] mt-1">تواصل مع فريق الدعم</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
