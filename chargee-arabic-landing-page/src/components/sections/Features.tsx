import { Package, Route, Building2, Truck, BarChart3, Users } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";
import { features } from "../../data/content";

const iconMap = {
  package: Package,
  route: Route,
  building: Building2,
  truck: Truck,
  chart: BarChart3,
  users: Users,
};

export default function Features() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="features" ref={ref} className="relative py-24 sm:py-28 bg-[var(--bg-light)]">
      <div className="container-px mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <Reveal>
            <span className="pill-badge">المميزات</span>
          </Reveal>
          <Reveal index={1}>
            <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
              كل عملياتك في <span className="brand-gradient-text">مكان واحد</span>
            </h2>
          </Reveal>
          <Reveal index={2}>
            <p className="mt-4 text-[var(--text-secondary)] text-lg leading-8">
              مجموعة أدوات مترابطة صُممت خصيصًا لاحتياجات شركات الشحن والنقل واللوجستيات.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => {
            const Icon = iconMap[f.icon as keyof typeof iconMap];
            return (
              <Reveal key={f.key} index={i}>
                <div className="card-elevate group relative h-full rounded-2xl bg-white border border-[var(--border)] p-7 overflow-hidden">
                  <div className="absolute -top-10 -left-10 h-28 w-28 rounded-full bg-[var(--orange)]/0 group-hover:bg-[var(--orange)]/10 transition-colors duration-500" />
                  <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--navy)] text-white">
                    <Icon size={22} />
                  </span>
                  <h3 className="relative mt-5 text-lg font-bold text-[var(--navy)]">{f.title}</h3>
                  <p className="relative mt-2.5 text-[var(--text-secondary)] leading-7">{f.desc}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
