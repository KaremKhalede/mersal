"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";
import { faqs } from "@/data/landing-content";

export default function FAQ() {
  const ref = useReveal<HTMLDivElement>();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" ref={ref} className="chargee-section bg-[var(--chargee-bg)]">
      <div className="chargee-container">
        <div className="text-center max-w-2xl mx-auto">
          <Reveal><span className="pill-badge">الأسئلة الشائعة</span></Reveal>
          <Reveal index={1}>
            <h2 className="chargee-section-title mt-5">
              أسئلة يتكرر <span className="chargee-accent">طرحها</span>
            </h2>
          </Reveal>
        </div>

        <div className="mt-14 grid lg:grid-cols-[1.1fr_0.9fr] gap-[var(--grid-gap)] items-start">
          <div className="space-y-3.5">
            {faqs.map((item, i) => {
              const open = openIndex === i;
              return (
                <Reveal key={item.q} index={i}>
                  <div
                    className={`rounded-2xl border bg-white transition-colors ${
                      open ? "border-[var(--chargee-orange)]/50" : "border-[var(--chargee-border)]"
                    }`}
                  >
                    <h3>
                      <button
                        onClick={() => setOpenIndex(open ? null : i)}
                        aria-expanded={open}
                        aria-controls={`faq-panel-${i}`}
                        className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-4.5 text-right"
                      >
                        <span className="font-bold text-[var(--chargee-text)] flex-1">{item.q}</span>
                        <span
                          className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                            open ? "bg-[var(--chargee-orange)] text-white" : "bg-[var(--chargee-bg)] text-[var(--chargee-navy)]"
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
                        <p className="px-5 sm:px-6 pb-5 text-[var(--chargee-muted)] leading-7 text-[14px]">{item.a}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>

          <Reveal index={2} className="relative hidden lg:block">
            <div className="rounded-[1.75rem] overflow-hidden shadow-[0_25px_60px_-20px_rgba(11,35,72,0.35)] border border-[var(--border)] bg-[var(--bg-light)] h-[460px] flex flex-col items-center justify-center p-8 relative">
              <div className="absolute inset-0 bg-white/40" />
              <div className="relative w-full max-w-sm space-y-4">
                <div className="w-full bg-white rounded-xl shadow-sm border border-[var(--border)] p-4 flex items-center gap-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--text-secondary)]"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <div className="h-4 w-32 bg-[var(--bg-light)] rounded-md" />
                </div>
                
                <div className="w-full bg-white rounded-xl shadow-sm border border-[var(--border)] p-5 space-y-3 opacity-90 transform -translate-x-2">
                  <div className="h-4 w-3/4 bg-[var(--navy)]/10 rounded-md" />
                  <div className="h-3 w-full bg-[var(--bg-light)] rounded-md" />
                  <div className="h-3 w-5/6 bg-[var(--bg-light)] rounded-md" />
                </div>
                
                <div className="w-full bg-[var(--navy)] text-white rounded-xl shadow-lg shadow-[var(--navy)]/20 p-5 space-y-3 transform translate-x-3">
                  <div className="h-4 w-2/3 bg-white/20 rounded-md" />
                  <div className="h-3 w-full bg-white/10 rounded-md" />
                  <div className="h-3 w-4/5 bg-white/10 rounded-md" />
                </div>
              </div>
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
