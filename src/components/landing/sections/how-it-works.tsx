"use client";

import { ArrowLeft } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";
import { steps } from "@/data/landing-content";

export default function HowItWorks() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="how-it-works" ref={ref} className="chargee-section bg-[var(--chargee-bg)]">
      <div className="chargee-container">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <Reveal><span className="pill-badge">آلية العمل</span></Reveal>
            <Reveal index={1}>
              <h2 className="chargee-section-title mt-5">
                ابدأ <span className="chargee-accent">بسهولة</span>
              </h2>
            </Reveal>
          </div>
          <Reveal index={2}>
            <p className="chargee-section-description max-w-md">
              لا حاجة لإنشاء حساب بنفسك — فريق مرسال يتولى تجهيز شركتك خطوة بخطوة.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-[var(--grid-gap)] relative">
          {steps.map((s, i) => (
            <Reveal key={s.number} index={i} className="relative z-10">
              <div className="chargee-card h-full p-8 flex flex-col items-start relative overflow-hidden group">
                <span className="absolute -top-10 -right-4 text-[120px] font-black text-[var(--chargee-soft-blue)] opacity-50 select-none group-hover:text-[var(--chargee-orange)]/10 transition-colors duration-300">
                  {s.number}
                </span>
                
                <div className="chargee-icon-box mb-6 relative z-10">
                  <span className="text-xl font-bold">{s.number}</span>
                </div>
                
                <h3 className="text-lg font-bold text-[var(--chargee-text)] relative z-10">{s.title}</h3>
                <p className="mt-3 text-[14px] text-[var(--chargee-muted)] leading-relaxed relative z-10">{s.desc}</p>
              </div>

              {i < steps.length - 1 && (
                <span className="hidden md:flex absolute top-1/2 -left-[14px] -translate-y-1/2 z-20 h-8 w-8 items-center justify-center rounded-full bg-white border border-[var(--chargee-border)] text-[var(--chargee-orange)] shadow-sm">
                  <ArrowLeft size={16} />
                </span>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
