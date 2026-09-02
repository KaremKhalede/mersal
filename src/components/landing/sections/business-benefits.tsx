"use client";

import { Eye, Clock, Layers, BrainCircuit, ShieldCheck } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";
import { benefits } from "@/data/landing-content";

const iconMap = { eye: Eye, clock: Clock, layers: Layers, brain: BrainCircuit, shield: ShieldCheck };

export default function BusinessBenefits() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="chargee-section bg-white">
      <div className="chargee-container">
        <div className="grid lg:grid-cols-2 gap-[var(--grid-gap)] items-center">
          <Reveal className="relative order-2 lg:order-1">
            <div className="rounded-[1.75rem] overflow-hidden shadow-[var(--shadow-card)] border border-[var(--chargee-border)] bg-[var(--chargee-bg)] h-[420px] flex flex-col p-6">
              <div className="flex items-center justify-between border-b border-[var(--chargee-border)] pb-4 mb-4">
                <p className="font-bold text-[var(--chargee-text)] text-sm">إدارة الصلاحيات والفريق</p>
                <div className="h-6 w-16 bg-white border border-[var(--chargee-border)] rounded-md" />
              </div>
              <div className="space-y-3">
                {[
                  { role: "مدير نظام", count: "2 مستخدم", tone: "blue" },
                  { role: "مشغل فروع", count: "8 مستخدمين", tone: "orange" },
                  { role: "سائق شاحنة", count: "34 مستخدم", tone: "success" },
                ].map((item, idx) => (
                  <div key={idx} className="bg-white border border-[var(--chargee-border)] rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-[var(--chargee-bg)] flex items-center justify-center font-bold text-[var(--chargee-muted)]">{item.role.charAt(0)}</div>
                      <div>
                        <p className="font-bold text-[var(--chargee-text)] text-sm">{item.role}</p>
                        <p className="text-[12px] text-[var(--chargee-muted)]">{item.count}</p>
                      </div>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-md bg-[var(--chargee-soft-blue)] text-[var(--chargee-blue)]`}>نشط</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <div className="order-1 lg:order-2">
            <Reveal><span className="pill-badge">لماذا مرسال</span></Reveal>
            <Reveal index={1}>
              <h2 className="chargee-section-title mt-5">
                مصمم ليجعل <span className="chargee-accent">يوم العمل أسهل</span>
              </h2>
            </Reveal>

            <div className="mt-9 space-y-[var(--content-gap)]">
              {benefits.map((b, i) => {
                const Icon = iconMap[b.icon as keyof typeof iconMap];
                return (
                  <Reveal key={b.title} index={i + 2} className="flex items-start gap-4">
                    <div className="chargee-icon-box shrink-0 bg-[var(--chargee-bg)] text-[var(--chargee-navy)]">
                      <Icon strokeWidth={2} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--chargee-text)]">{b.title}</h3>
                      <p className="chargee-section-description mt-1 leading-relaxed">{b.desc}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
