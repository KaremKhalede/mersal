"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LogIn, Send, Building2 } from "lucide-react";
import { useReveal } from "@/hooks/use-reveal";
import Reveal from "../reveal";

export default function BusinessAccess() {
  const ref = useReveal<HTMLDivElement>();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contact" ref={ref} className="chargee-section bg-white">
      <div className="chargee-container">
        <div className="grid lg:grid-cols-2 gap-[var(--grid-gap)] items-start">
          <div>
            <Reveal><span className="pill-badge">التواصل مع فريقنا</span></Reveal>
            <Reveal index={1}>
              <h2 className="chargee-section-title mt-5">
                حل يناسب <span className="chargee-accent">طريقة عملك</span>
              </h2>
            </Reveal>
            <Reveal index={2}>
              <p className="chargee-section-description max-w-lg mt-4">
                تواصل مع فريق مرسال لنتعرف على احتياجات منشأتك ونحدد الحل المناسب لعملياتك.
              </p>
            </Reveal>

            <Reveal index={3} className="mt-8 space-y-[calc(var(--content-gap)/2)]">
              {[
                "نراجع طبيعة عملياتك وعدد الفروع والسائقين",
                "نجهّز حساب شركتك ونهيئ صلاحيات الفريق",
                "نرافقك في أول خطوات الاستخدام داخل النظام",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="text-[var(--chargee-success)] mt-0.5 shrink-0" size={20} />
                  <p className="text-[var(--chargee-text)]/85">{item}</p>
                </div>
              ))}
            </Reveal>

            <Reveal index={4} className="mt-9 flex flex-wrap gap-3">
              <button onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })} className="chargee-primary-button">
                <Building2 size={17} />
                تواصل معنا
              </button>
              <Link href="/login" className="chargee-secondary-button">
                <LogIn size={17} />
                تسجيل الدخول
              </Link>
            </Reveal>
          </div>

          <Reveal index={2}>
            <div className="rounded-[1.75rem] border border-[var(--chargee-border)] bg-[var(--chargee-bg)] p-7 sm:p-9 shadow-[var(--shadow-card)]">
              {submitted ? (
                <div className="flex flex-col items-center text-center py-10">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-[var(--chargee-success)]">
                    <CheckCircle2 size={32} />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[var(--chargee-text)]">تم استلام طلبك بنجاح</h3>
                  <p className="mt-2 text-[var(--chargee-muted)] leading-7 max-w-sm">
                    سيتواصل معك فريق مرسال قريبًا لمناقشة احتياجات منشأتك وتجهيز حساب شركتك.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <h3 className="text-lg font-bold text-[var(--chargee-text)] mb-1">تحدث مع فريق مرسال</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="اسم الشركة" placeholder="مثال: شركة الشحن السريع" required />
                    <Field label="الاسم الكامل" placeholder="اسمك الكامل" required />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="رقم الجوال" placeholder="05xxxxxxxx" type="tel" required />
                    <Field label="البريد الإلكتروني" placeholder="name@company.com" type="email" required />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--chargee-text)] mb-1.5">تفاصيل إضافية</label>
                    <textarea
                      rows={4}
                      placeholder="عدد الفروع، السائقين، أو أي متطلبات خاصة بعملياتك"
                      className="w-full rounded-xl border border-[var(--chargee-border)] bg-white px-4 py-3 text-sm text-[var(--chargee-text)] placeholder:text-[var(--chargee-muted)]/70 focus:border-[var(--chargee-orange)] focus:ring-2 focus:ring-[var(--chargee-orange)]/20 outline-none transition"
                    />
                  </div>
                  <button type="submit" className="chargee-primary-button w-full justify-center mt-4 shadow-lg shadow-orange-500/30">
                    <Send size={17} />
                    إرسال الطلب
                  </button>
                  <p className="text-xs text-center text-[var(--chargee-muted)] mt-3">
                    سيتم مراجعة طلبك من قبل إدارة المنصة قبل تفعيل حساب شركتك.
                  </p>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[var(--chargee-text)] mb-1.5">{label}</label>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--chargee-border)] bg-white px-4 py-3 text-sm text-[var(--chargee-text)] placeholder:text-[var(--chargee-muted)]/70 focus:border-[var(--chargee-orange)] focus:ring-2 focus:ring-[var(--chargee-orange)]/20 outline-none transition"
      />
    </div>
  );
}
