"use client";

import { PhoneCall, LogIn, MapPin, Truck, Package, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";

export default function FinalCTA() {
  const ref = useReveal<HTMLDivElement>();
  const scrollTo = (href: string) => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section ref={ref} className="chargee-section overflow-hidden">
      <div className="chargee-container">
        <Reveal>
          <div className="relative rounded-[2rem] overflow-hidden">
            <div className="absolute inset-0 bg-[var(--chargee-deep)]" />
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--chargee-deep)] to-transparent" />
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[var(--chargee-orange)]/20 blur-[80px] pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[var(--chargee-blue)]/20 blur-[80px] pointer-events-none" />
            
            <svg className="absolute inset-x-0 bottom-10 w-full h-16 opacity-30" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-50 40 C 300 10, 700 70, 1100 20 S 1500 40, 1600 10" stroke="#F97316" strokeWidth="2" className="route-dash" fill="none" />
            </svg>

            {/* Floating system elements */}
            <div className="hidden lg:block">
              {/* Shipment */}
              <div className="animate-float absolute top-10 right-10 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--chargee-orange)]/20 text-[#fdc26a]"><MapPin size={20} /></span>
                <div>
                  <p className="text-xs text-white/60">شحنة #1042</p>
                  <p className="text-sm font-bold text-white mt-0.5">في الطريق</p>
                </div>
              </div>
              
              {/* Trip */}
              <div className="animate-float-slow absolute top-14 left-12 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--chargee-soft-blue)]/20 text-blue-300"><Truck size={20} /></span>
                <div>
                  <p className="text-xs text-white/60">رحلة #T-908</p>
                  <p className="text-sm font-bold text-white mt-0.5">الرياض ← الدمام</p>
                </div>
              </div>

              {/* Carton */}
              <div className="animate-float absolute bottom-12 right-16 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white"><Package size={20} /></span>
                <div>
                  <p className="text-xs text-white/60">كود الكرتون</p>
                  <p className="text-sm font-bold text-white mt-0.5">CR-8472-XL</p>
                </div>
              </div>

              {/* Delivery */}
              <div className="animate-float-slow absolute bottom-16 left-16 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-3 flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--chargee-success)]/20 text-green-400"><CheckCircle2 size={20} /></span>
                <div>
                  <p className="text-xs text-white/60">حالة التسليم</p>
                  <p className="text-sm font-bold text-white mt-0.5">تم تسليم الشحنة</p>
                </div>
              </div>
            </div>

            <div className="relative px-6 py-16 sm:px-14 sm:py-20 text-center flex flex-col items-center">
              <h2 className="chargee-section-title !text-white max-w-2xl">
                جاهز لتنظيم عمليات الشحن <span className="chargee-accent">بشكل أفضل؟</span>
              </h2>
              <p className="chargee-section-description !text-white/70 max-w-xl">
                إدارة أوضح، تشغيل أكثر سلاسة، وكل عملياتك في مكان واحد.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <button onClick={() => scrollTo("#contact")} className="chargee-primary-button !bg-[var(--chargee-orange)] hover:!bg-[#e86004]">
                  <PhoneCall size={18} />
                  تواصل معنا
                </button>
                <Link href="/login" className="chargee-secondary-button !text-white !border-white/20 hover:!bg-white/10">
                  <LogIn size={18} />
                  تسجيل الدخول
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
