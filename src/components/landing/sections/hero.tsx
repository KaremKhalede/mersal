"use client";

import { PhoneCall, LogIn, ShieldCheck, PackageCheck, MapPin } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";

const HERO_IMG =
  "https://images.pexels.com/photos/16706765/pexels-photo-16706765.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1000&w=1200";

export default function Hero() {
  const ref = useReveal<HTMLDivElement>();

  const scrollTo = (href: string) => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section
      id="home"
      ref={ref}
      className="relative overflow-hidden pt-28 pb-20 bg-[var(--chargee-deep)] text-white"
    >
      {/* ambient background */}
      <div className="absolute inset-0 -z-10 opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--chargee-navy)_0%,_transparent_50%)]" />
      <div className="absolute -top-40 -left-32 -z-10 h-96 w-96 rounded-full bg-[var(--chargee-blue)]/20 blur-[100px]" />
      <div className="absolute bottom-0 right-0 -z-10 h-full w-2/3 bg-gradient-to-l from-[var(--chargee-deep)]/0 via-[var(--chargee-deep)]/80 to-[var(--chargee-deep)] pointer-events-none" />

      {/* subtle animated route line across the top */}
      <svg
        className="absolute top-24 inset-x-0 w-full h-16 -z-10 opacity-20"
        viewBox="0 0 1440 60"
        fill="none"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M-50 40 C 300 10, 700 70, 1100 20 S 1500 40, 1600 10" stroke="#F97316" strokeWidth="2" className="route-dash" fill="none" />
      </svg>

      <div className="chargee-container relative">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-[var(--grid-gap)] items-center">
          {/* Text column */}
          <div>
            <Reveal index={0}>
              <span className="pill-badge on-dark">
                <ShieldCheck size={14} />
                منصة مخصصة للشركات المسجلة
              </span>
            </Reveal>

            <Reveal index={1}>
              <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[4rem] font-black leading-[1.15] text-white tracking-tight">
                المنصة الذكية
                <br />
                لإدارة <span className="chargee-accent">عمليات الشحن</span>
              </h1>
            </Reveal>

            <Reveal index={2}>
              <p className="mt-4 max-w-xl text-lg leading-[1.7] text-white/80 font-medium">
                أدر شحناتك، رحلاتك، فروعك وعمليات التوصيل من منصة واحدة مصممة لتجعل العمل اليومي أكثر وضوحًا وسلاسة.
              </p>
            </Reveal>

            <Reveal index={3} className="mt-7 flex flex-wrap items-center gap-3">
              <button onClick={() => scrollTo("#contact")} className="chargee-primary-button px-8 py-3.5 !bg-[var(--chargee-orange)] hover:!bg-[#e86004]">
                <PhoneCall size={18} />
                تواصل معنا
              </button>
              <a href="/login" className="chargee-secondary-button !text-white !border-white/20 hover:!bg-white/10 px-8 py-3.5">
                <LogIn size={18} />
                تسجيل الدخول
              </a>
            </Reveal>

            <Reveal index={4} className="mt-8 flex items-center gap-3 text-sm font-semibold text-white/70">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
                <PackageCheck size={16} />
              </span>
              حل متكامل لإدارة عمليات الشحن والنقل
            </Reveal>
          </div>

          {/* Visual column */}
          <Reveal index={2} className="relative mt-8 lg:mt-0">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="relative rounded-[2rem] overflow-hidden shadow-[var(--shadow-card)] border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={HERO_IMG}
                  alt="شاحنة نقل حديثة تعمل ضمن شبكة عمليات شحن ذكية"
                  className="w-full h-[460px] sm:h-[520px] object-cover opacity-90 saturate-[0.8] contrast-[1.1]"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--chargee-deep)]/95 via-[var(--chargee-deep)]/30 to-transparent" />

                {/* route dashed line over the image */}
                <svg className="absolute inset-x-0 bottom-24 w-full h-16 opacity-50" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M0 40 Q 100 10 200 35 T 400 20" stroke="#F97316" strokeWidth="2" className="route-dash" fill="none" />
                </svg>

                <div className="absolute bottom-8 inset-x-8 flex items-center justify-between">
                  <div>
                    <p className="text-white font-bold text-xl lg:text-2xl">إدارة الشحن، بلا تعقيد</p>
                    <p className="text-white/70 text-[15px] mt-1.5">تتبع لحظي لكل رحلة وكل شحنة</p>
                  </div>
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-[var(--chargee-orange)] pulse-dot" />
                </div>
              </div>

              {/* floating card: active shipment */}
              <div className="animate-float absolute -top-8 -right-4 sm:-right-8 bg-[var(--chargee-navy)] rounded-2xl shadow-[var(--shadow-hover)] border border-white/10 p-5 flex items-center gap-4 backdrop-blur-md">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--chargee-orange)]/10 text-[var(--chargee-orange)]">
                  <MapPin size={24} />
                </span>
                <div>
                  <p className="text-[13px] text-white/60">شحنة #1042</p>
                  <p className="text-[16px] font-bold text-white mt-0.5">في الطريق للتسليم</p>
                </div>
              </div>

              {/* floating card: branches */}
              <div className="animate-float-slow absolute -bottom-8 -left-4 sm:-left-10 bg-[var(--chargee-navy)] rounded-2xl shadow-[var(--shadow-hover)] border border-white/10 px-7 py-5 backdrop-blur-md">
                <p className="text-[13px] text-white/60">فروع نشطة</p>
                <p className="text-[34px] font-black text-white mt-1 leading-none">24</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
