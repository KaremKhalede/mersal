"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  LogIn,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Logo from "@/components/landing/logo";

const activityTypes = ["شركة شحن ونقل", "شركة توزيع", "متجر إلكتروني", "مؤسسة لوجستية", "أخرى"];

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-[var(--text-primary)]" dir="rtl">
      <header className="container-px mx-auto max-w-7xl w-full py-6 flex items-center justify-between">
        <Link href="/" aria-label="مرسال — العودة للرئيسية">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary !py-2 !px-4 text-sm">
            <LogIn size={15} />
            تسجيل الدخول
          </Link>
          <Link href="/" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--navy)]/70 hover:text-[var(--orange-deep)] transition-colors">
            <ArrowRight size={15} />
            العودة للرئيسية
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="container-px mx-auto max-w-7xl py-8 sm:py-12">
          <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-10 items-start">
            {/* Info panel */}
            <div className="relative rounded-[1.75rem] bg-[var(--navy-deep)] text-white p-8 sm:p-10 overflow-hidden lg:sticky lg:top-10">
              <div
                className="absolute inset-0 opacity-[0.1] pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 15% 15%, #F2851C 0, transparent 40%), radial-gradient(circle at 85% 85%, #155EEF 0, transparent 45%)",
                }}
              />
              <span className="pill-badge on-dark relative">
                <Building2 size={14} />
                تسجيل شركة جديدة
              </span>
              <h1 className="relative mt-5 text-2xl sm:text-3xl font-black leading-snug">
                هذا الطلب <span className="text-[var(--orange-light)]">ليس إنشاء حساب فوري</span>
              </h1>
              <p className="relative mt-4 text-white/60 leading-8">
                مرسال منصة مخصصة للشركات المسجلة. عند إرسال هذا الطلب، يقوم فريق مرسال بمراجعة بيانات
                منشأتك، ثم تجهيز حساب شركتك وربطه بمدير الشركة الذي سيتولى لاحقًا إضافة الموظفين
                وصلاحياتهم من داخل النظام.
              </p>

              <div className="relative mt-8 space-y-5">
                {[
                  { icon: ClipboardCheck, title: "مراجعة الطلب", desc: "يتحقق فريقنا من بيانات الشركة المُرسلة." },
                  { icon: ShieldCheck, title: "اعتماد واعداد الحساب", desc: "تقوم إدارة المنصة بإنشاء حساب الشركة رسميًا." },
                  { icon: UsersRound, title: "إدارة فريقك", desc: "يستلم مدير الشركة الدخول ويضيف الموظفين بنفسه." },
                ].map((s) => (
                  <div key={s.title} className="flex items-start gap-3.5">
                    <span className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                      <s.icon size={18} />
                    </span>
                    <div>
                      <p className="font-bold">{s.title}</p>
                      <p className="text-sm text-white/55 mt-0.5 leading-6">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="relative mt-9 pt-6 border-t border-white/10 text-sm text-white/50 leading-7">
                لديك حساب شركة مسجل بالفعل؟{" "}
                <Link href="/login" className="text-[var(--orange-light)] font-bold hover:underline">
                  ادخل من بوابة تسجيل الدخول
                </Link>
              </div>
            </div>

            {/* Form panel */}
            <div className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--bg-light)] p-6 sm:p-10">
              {submitted ? (
                <div className="flex flex-col items-center text-center py-14">
                  <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-[var(--success)]">
                    <CheckCircle2 size={40} />
                  </span>
                  <h2 className="mt-6 text-2xl font-black text-[var(--navy)]">تم استلام طلب التسجيل</h2>
                  <p className="mt-3 text-[var(--text-secondary)] leading-8 max-w-md">
                    شكرًا لتواصلك مع مرسال. سيقوم فريقنا بمراجعة بيانات شركتك والتواصل معك خلال أيام
                    العمل لإتمام إجراءات تفعيل حساب شركتك.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3 justify-center">
                    <Link href="/" className="btn-secondary">
                      <ArrowRight size={16} />
                      العودة للرئيسية
                    </Link>
                    <Link href="/login" className="btn-primary">
                      <LogIn size={16} />
                      تسجيل الدخول
                    </Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-[var(--navy)]">بيانات الشركة</h2>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      عبّئ النموذج التالي وسيتواصل معك فريقنا لإتمام عملية التسجيل والاعتماد.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="اسم الشركة" placeholder="مثال: شركة الشحن السريع" required />
                    <Field label="رقم السجل التجاري" placeholder="اختياري" />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[var(--navy)] mb-1.5">نوع النشاط</label>
                      <select
                        required
                        defaultValue=""
                        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--navy)] focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20 outline-none transition"
                      >
                        <option value="" disabled>
                          اختر نوع النشاط
                        </option>
                        {activityTypes.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Field label="المدينة" placeholder="مثال: الرياض" required />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="عدد الفروع" placeholder="مثال: 3" type="number" />
                    <Field label="عدد السائقين / المركبات" placeholder="مثال: 15" type="number" />
                  </div>

                  <div className="h-px bg-[var(--border)]" />

                  <div>
                    <h3 className="font-bold text-[var(--navy)]">بيانات المسؤول</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                      سيكون هذا الشخص مدير حساب الشركة المسؤول عن إدارة الموظفين لاحقًا.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="الاسم الكامل" placeholder="اسمك الكامل" required />
                    <Field label="المسمى الوظيفي" placeholder="مثال: مدير العمليات" required />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="البريد الإلكتروني" placeholder="name@company.com" type="email" required />
                    <Field label="رقم الجوال" placeholder="05xxxxxxxx" type="tel" required />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[var(--navy)] mb-1.5">ملاحظات إضافية</label>
                    <textarea
                      rows={4}
                      placeholder="أي تفاصيل تساعدنا على فهم احتياجات عملياتك"
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--navy)] placeholder:text-[var(--text-secondary)]/70 focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20 outline-none transition"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <input type="checkbox" required className="mt-1 accent-[var(--orange)]" />
                    أقر بأن البيانات المُدخلة صحيحة وأوافق على تواصل فريق مرسال معي بخصوص هذا الطلب.
                  </label>

                  <button type="submit" className="btn-primary w-full justify-center">
                    <ClipboardCheck size={18} />
                    إرسال طلب التسجيل
                  </button>
                  <p className="text-xs text-center text-[var(--text-secondary)]">
                    لن يتم تفعيل أي حساب إلا بعد مراجعة الطلب واعتماده من إدارة المنصة.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
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
      <label className="block text-sm font-semibold text-[var(--navy)] mb-1.5">{label}</label>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--navy)] placeholder:text-[var(--text-secondary)]/70 focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20 outline-none transition"
      />
    </div>
  );
}
