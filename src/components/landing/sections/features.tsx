"use client";

import { Package, Route, Building2, Truck, BarChart3, Users } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";
import { features } from "@/data/landing-content";

const iconMap = { package: Package, route: Route, building: Building2, truck: Truck, chart: BarChart3, users: Users };

export default function Features() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="features" ref={ref} className="chargee-section bg-[var(--chargee-bg)]">
      <div className="chargee-container">
        <div className="max-w-2xl">
          <Reveal><span className="pill-badge">المميزات</span></Reveal>
          <Reveal index={1}>
            <h2 className="chargee-section-title mt-5">
              كل عملياتك في <span className="chargee-accent">مكان واحد</span>
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="chargee-section-description">
              مجموعة أدوات مترابطة صُممت خصيصًا لاحتياجات شركات الشحن والنقل واللوجستيات.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-[var(--grid-gap)]">
          {features.map((f, i) => {
            const Icon = iconMap[f.icon as keyof typeof iconMap];
            return (
              <Reveal key={f.key} index={i}>
                <div className="chargee-card h-full p-7 relative overflow-hidden group">
                  <div className="chargee-icon-box mb-5">
                    <Icon strokeWidth={1.75} />
                  </div>
                  <h3 className="text-lg font-bold text-[var(--chargee-text)]">{f.title}</h3>
                  <p className="mt-2.5 text-[14px] text-[var(--chargee-muted)] leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
