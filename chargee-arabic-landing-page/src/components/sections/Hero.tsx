import { PhoneCall, LogIn, ShieldCheck, PackageCheck, MapPin } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";

const HERO_IMG =
  "https://images.pexels.com/photos/16706765/pexels-photo-16706765.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1000&w=1200";

export default function Hero() {
  const ref = useReveal<HTMLDivElement>();

  const scrollTo = (href: string) => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section
      id="home"
      ref={ref}
      className="relative overflow-hidden pt-32 pb-20 sm:pt-36 sm:pb-28"
    >
      {/* ambient background */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,#ffffff_0%,#f5f8fc_55%,#eef3fb_100%)]" />
      <div className="absolute -top-40 -left-32 -z-10 h-96 w-96 rounded-full bg-[var(--navy)]/10 blur-3xl" />
      <div className="absolute top-40 -right-24 -z-10 h-80 w-80 rounded-full bg-[var(--orange)]/10 blur-3xl" />

      {/* subtle animated route line across the top */}
      <svg
        className="absolute top-24 inset-x-0 w-full h-16 -z-10 opacity-30"
        viewBox="0 0 1440 60"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M-50 40 C 300 10, 700 70, 1100 20 S 1500 40, 1600 10" stroke="#155EEF" strokeWidth="2" className="route-dash" fill="none" />
      </svg>

      <div className="container-px mx-auto max-w-7xl relative">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Text column */}
          <div>
            <Reveal index={0}>
              <span className="pill-badge">
                <ShieldCheck size={14} />
                منصة مخصصة للشركات المسجلة
              </span>
            </Reveal>

            <Reveal index={1}>
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-[3.4rem] font-black leading-[1.2] text-[var(--navy)]">
                المنصة الذكية
                <br />
                لإدارة <span className="brand-gradient-text">عمليات الشحن</span>
              </h1>
            </Reveal>

            <Reveal index={2}>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--text-secondary)]">
                أدر شحناتك، رحلاتك، فروعك وعمليات التوصيل من منصة واحدة مصممة لتجعل العمل اليومي أكثر وضوحًا وسلاسة.
              </p>
            </Reveal>

            <Reveal index={3} className="mt-9 flex flex-wrap items-center gap-3.5">
              <button onClick={() => scrollTo("#contact")} className="btn-primary text-base">
                <PhoneCall size={18} />
                تواصل معنا
              </button>
              <a href="/login" className="btn-secondary text-base">
                <LogIn size={18} />
                تسجيل الدخول
              </a>
            </Reveal>

            <Reveal index={4} className="mt-8 flex items-center gap-2.5 text-sm font-semibold text-[var(--navy)]/70">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--success)]/10 text-[var(--success)]">
                <PackageCheck size={14} />
              </span>
              حل متكامل لإدارة عمليات الشحن والنقل
            </Reveal>
          </div>

          {/* Visual column */}
          <Reveal index={2} className="relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="relative rounded-[2rem] overflow-hidden shadow-[0_30px_70px_-20px_rgba(11,35,72,0.4)] border border-white">
                <img
                  src={HERO_IMG}
                  alt="شاحنة نقل حديثة تعمل ضمن شبكة عمليات شحن ذكية"
                  className="w-full h-[420px] sm:h-[480px] object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy-deep)]/85 via-[var(--navy-deep)]/10 to-transparent" />

                {/* route dashed line over the image */}
                <svg className="absolute inset-x-0 bottom-24 w-full h-16 opacity-70" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 40 Q 100 10 200 35 T 400 20" stroke="#fff" strokeWidth="2" className="route-dash" fill="none" />
                </svg>

                <div className="absolute bottom-5 inset-x-5 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-lg">إدارة الشحن، بلا تعقيد</p>
                    <p className="text-white/60 text-xs mt-1">تتبع لحظي لكل رحلة وكل شحنة</p>
                  </div>
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--orange)] pulse-dot" />
                </div>
              </div>

              {/* floating card: active shipment */}
              <div className="animate-float absolute -top-6 -right-4 sm:-right-8 bg-white rounded-2xl shadow-[0_20px_45px_-15px_rgba(11,35,72,0.3)] border border-[var(--border)] px-4 py-3 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--soft-blue)] text-[var(--blue)]">
                  <MapPin size={18} />
                </span>
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">شحنة #1042</p>
                  <p className="text-sm font-bold text-[var(--navy)]">في الطريق للتسليم</p>
                </div>
              </div>

              {/* floating card: branches */}
              <div className="animate-float-slow absolute -bottom-6 -left-4 sm:-left-10 bg-white rounded-2xl shadow-[0_20px_45px_-15px_rgba(11,35,72,0.3)] border border-[var(--border)] px-4 py-3">
                <p className="text-xs text-[var(--text-secondary)]">فروع نشطة</p>
                <p className="text-2xl font-black text-[var(--navy)]">24</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
