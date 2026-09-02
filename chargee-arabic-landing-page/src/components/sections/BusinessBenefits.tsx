import { Eye, Clock, Layers, BrainCircuit, ShieldCheck } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";
import { benefits } from "../../data/content";

const iconMap = {
  eye: Eye,
  clock: Clock,
  layers: Layers,
  brain: BrainCircuit,
  shield: ShieldCheck,
};

const IMG =
  "https://images.pexels.com/photos/25461764/pexels-photo-25461764.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=900&w=800";

export default function BusinessBenefits() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="relative py-24 sm:py-28 bg-white">
      <div className="container-px mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <Reveal className="relative order-2 lg:order-1">
            <div className="relative rounded-[1.75rem] overflow-hidden shadow-[0_25px_60px_-20px_rgba(11,35,72,0.35)]">
              <img src={IMG} alt="موظف يدير عمليات الشحن في المستودع عبر النظام" className="w-full h-[420px] object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy-deep)]/70 via-transparent to-transparent" />
            </div>
            <div className="animate-float absolute -bottom-6 -right-4 sm:-right-8 bg-white rounded-2xl shadow-[0_20px_45px_-15px_rgba(11,35,72,0.3)] border border-[var(--border)] px-5 py-3.5">
              <p className="text-xs text-[var(--text-secondary)]">صلاحيات حسب الدور</p>
              <p className="text-sm font-bold text-[var(--navy)] mt-1">مدير · مشغل · سائق</p>
            </div>
          </Reveal>

          <div className="order-1 lg:order-2">
            <Reveal>
              <span className="pill-badge">لماذا مرسال</span>
            </Reveal>
            <Reveal index={1}>
              <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
                مصمم ليجعل <span className="brand-gradient-text">يوم العمل أسهل</span>
              </h2>
            </Reveal>

            <div className="mt-9 space-y-5">
              {benefits.map((b, i) => {
                const Icon = iconMap[b.icon as keyof typeof iconMap];
                return (
                  <Reveal key={b.title} index={i + 2} className="flex items-start gap-4">
                    <span className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--soft-blue)] text-[var(--blue)]">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h3 className="font-bold text-[var(--navy)]">{b.title}</h3>
                      <p className="text-[var(--text-secondary)] mt-1 leading-7">{b.desc}</p>
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
