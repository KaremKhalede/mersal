"use client";

import { PackageCheck, PackagePlus, ArrowUpFromLine, Route, Truck, CheckCircle2 } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";
import { workflowStages } from "@/data/landing-content";

const icons = [PackageCheck, PackagePlus, ArrowUpFromLine, Route, Truck, CheckCircle2];

export default function WorkflowTimeline() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="chargee-section bg-[var(--chargee-deep)] text-white overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #155EEF 0, transparent 40%), radial-gradient(circle at 80% 70%, #F2851C 0, transparent 40%)" }}
      />
      <div className="chargee-container relative">
        <div className="max-w-2xl">
          <Reveal><span className="pill-badge on-dark">دورة العمل</span></Reveal>
          <Reveal index={1}>
            <h2 className="chargee-section-title mt-5 !text-white">
              مراحل الشحنة من <span className="chargee-accent">الاستلام حتى التسليم</span>
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="chargee-section-description max-w-lg mt-4 !text-white/70">
              يتابع مرسال كل شحنة عبر مراحل واضحة، بحيث يعرف فريقك دائمًا أين توجد كل عملية.
            </p>
          </Reveal>
        </div>

        {/* Desktop horizontal */}
        <div className="hidden md:block mt-16 relative">
          <div className="absolute top-7 inset-x-0 h-0.5 bg-white/10" />
          <div className="absolute top-7 right-0 h-0.5 w-full bg-gradient-to-l from-[var(--orange)] to-[var(--blue)] origin-right scale-x-[0.92]" />
          <div className="grid grid-cols-6 gap-3">
            {workflowStages.map((stage, i) => {
              const Icon = icons[i];
              return (
                <Reveal key={stage} index={i} className="relative z-10 flex flex-col items-center text-center">
                  <span className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-white text-[var(--navy)] shadow-xl shadow-black/10">
                    <Icon size={26} strokeWidth={1.5} />
                  </span>
                  <p className="mt-4 text-sm font-bold">{stage}</p>
                </Reveal>
              );
            })}
          </div>
        </div>

        {/* Mobile vertical */}
        <div className="md:hidden mt-12 relative pr-6">
          <div className="absolute top-2 bottom-2 right-[1.65rem] w-0.5 bg-gradient-to-b from-[var(--orange)] to-[var(--blue)]" />
          <div className="space-y-8">
            {workflowStages.map((stage, i) => {
              const Icon = icons[i];
              return (
                <Reveal key={stage} index={i} className="relative z-10 flex items-center gap-4">
                  <span className="relative shrink-0 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--navy)] shadow-lg shadow-black/10">
                    <Icon size={24} strokeWidth={1.5} />
                  </span>
                  <p className="font-bold">{stage}</p>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
