"use client";

import { LayoutGrid, Sparkles, Database, SmilePlus } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";
import { trustPoints } from "@/data/landing-content";

const icons = [LayoutGrid, Sparkles, Database, SmilePlus];

export default function TrustSection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="relative py-14 border-y border-[var(--border)] bg-white">
      <div className="container-px mx-auto w-full max-w-[92%]">
        <Reveal className="text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-[var(--navy)]">
            كل ما تحتاجه لإدارة عمليات الشحن في مكان واحد
          </h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-5">
          {trustPoints.map((point, i) => {
            const Icon = icons[i];
            return (
              <Reveal key={point} index={i} className="flex flex-col items-center text-center gap-3 py-4">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--soft-blue)] text-[var(--blue)]">
                  <Icon size={22} />
                </span>
                <span className="text-sm font-bold text-[var(--navy)]">{point}</span>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
