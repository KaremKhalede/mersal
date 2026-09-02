import { PackageCheck, PackagePlus, ArrowUpFromLine, Route, Truck, CheckCircle2 } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";
import { workflowStages } from "../../data/content";

const icons = [PackageCheck, PackagePlus, ArrowUpFromLine, Route, Truck, CheckCircle2];

export default function WorkflowTimeline() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="relative py-24 sm:py-28 bg-[var(--navy-deep)] text-white overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #155EEF 0, transparent 40%), radial-gradient(circle at 80% 70%, #F2851C 0, transparent 40%)" }}
      />
      <div className="container-px mx-auto max-w-7xl relative">
        <div className="max-w-2xl">
          <Reveal>
            <span className="pill-badge on-dark">دورة العمل</span>
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-3xl sm:text-4xl font-black leading-snug">
              مراحل الشحنة من <span className="text-[var(--orange-light)]">الاستلام حتى التسليم</span>
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-4 text-white/60 leading-8 text-lg">
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
                <Reveal key={stage} index={i} className="flex flex-col items-center text-center">
                  <span className="relative z-10 inline-flex h-14 w-14 items-center justify-center rounded-full bg-white text-[var(--navy)] shadow-lg">
                    <Icon size={22} />
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
                <Reveal key={stage} index={i} className="flex items-center gap-4 relative">
                  <span className="relative z-10 shrink-0 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--navy)] shadow-lg">
                    <Icon size={19} />
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
