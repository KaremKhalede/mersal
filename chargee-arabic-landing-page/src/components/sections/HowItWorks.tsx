import { ArrowLeft } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";
import { steps } from "../../data/content";

const images = [
  "https://images.pexels.com/photos/33587048/pexels-photo-33587048.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=700&w=700",
  "https://images.pexels.com/photos/38853983/pexels-photo-38853983.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=700&w=700",
  "https://images.pexels.com/photos/7362917/pexels-photo-7362917.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=700&w=700",
];

export default function HowItWorks() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="how-it-works" ref={ref} className="relative py-24 sm:py-28 bg-[var(--bg-light)]">
      <div className="container-px mx-auto max-w-7xl">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            <Reveal>
              <span className="pill-badge">آلية العمل</span>
            </Reveal>
            <Reveal index={1}>
              <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
                ابدأ <span className="brand-gradient-text">بسهولة</span>
              </h2>
            </Reveal>
          </div>
          <Reveal index={2}>
            <p className="max-w-md text-[var(--text-secondary)] leading-8">
              لا حاجة لإنشاء حساب بنفسك — فريق مرسال يتولى تجهيز شركتك خطوة بخطوة.
            </p>
          </Reveal>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-6 relative">
          {steps.map((s, i) => (
            <Reveal key={s.number} index={i} className="relative">
              <div className="card-elevate group relative rounded-2xl overflow-hidden border border-[var(--border)] bg-white h-full">
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={images[i]}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy-deep)]/80 to-transparent" />
                  <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--orange)] text-white text-xs font-bold px-3 py-1.5">
                    الخطوة {s.number}
                  </span>
                </div>
                <div className="p-6">
                  <h3 className="text-lg font-bold text-[var(--navy)]">{s.title}</h3>
                  <p className="mt-2 text-[var(--text-secondary)] leading-7">{s.desc}</p>
                </div>
              </div>

              {i < steps.length - 1 && (
                <span className="hidden md:flex absolute top-24 -left-3 z-10 h-9 w-9 items-center justify-center rounded-full bg-white border border-[var(--border)] text-[var(--orange-deep)] shadow-sm">
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
