import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, LogIn, Send, Building2 } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";

export default function BusinessAccess() {
  const ref = useReveal<HTMLDivElement>();
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contact" ref={ref} className="relative py-24 sm:py-28 bg-white">
      <div className="container-px mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-14 items-start">
          <div>
            <Reveal>
              <span className="pill-badge">التواصل مع فريقنا</span>
            </Reveal>
            <Reveal index={1}>
              <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
                حل يناسب <span className="brand-gradient-text">طريقة عملك</span>
              </h2>
            </Reveal>
            <Reveal index={2}>
              <p className="mt-4 text-lg leading-8 text-[var(--text-secondary)] max-w-lg">
                تواصل مع فريق مرسال لنتعرف على احتياجات منشأتك ونحدد الحل المناسب لعملياتك.
              </p>
            </Reveal>

            <Reveal index={3} className="mt-8 space-y-4">
              {[
                "نراجع طبيعة عملياتك وعدد الفروع والسائقين",
                "نجهّز حساب شركتك ونهيئ صلاحيات الفريق",
                "نرافقك في أول خطوات الاستخدام داخل النظام",
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="text-[var(--success)] mt-0.5 shrink-0" size={20} />
                  <p className="text-[var(--navy)]/85">{item}</p>
                </div>
              ))}
            </Reveal>

            <Reveal index={4} className="mt-9 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary">
                <Building2 size={17} />
                تسجيل شركة جديدة
              </Link>
              <Link to="/login" className="btn-secondary">
                <LogIn size={17} />
                تسجيل الدخول
              </Link>
            </Reveal>
          </div>

          <Reveal index={2}>
            <div className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--bg-light)] p-7 sm:p-9 shadow-[0_20px_50px_-20px_rgba(11,35,72,0.25)]">
              {submitted ? (
                <div className="flex flex-col items-center text-center py-10">
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-[var(--success)]">
                    <CheckCircle2 size={32} />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-[var(--navy)]">تم استلام طلبك بنجاح</h3>
                  <p className="mt-2 text-[var(--text-secondary)] leading-7 max-w-sm">
                    سيتواصل معك فريق مرسال قريبًا لمناقشة احتياجات منشأتك وتجهيز حساب شركتك.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <h3 className="text-lg font-bold text-[var(--navy)] mb-1">تحدث مع فريق مرسال</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="اسم الشركة" placeholder="مثال: شركة الشحن السريع" required />
                    <Field label="الاسم الكامل" placeholder="اسمك الكامل" required />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field label="رقم الجوال" placeholder="05xxxxxxxx" type="tel" required />
                    <Field label="البريد الإلكتروني" placeholder="name@company.com" type="email" required />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--navy)] mb-1.5">تفاصيل إضافية</label>
                    <textarea
                      rows={4}
                      placeholder="عدد الفروع، السائقين، أو أي متطلبات خاصة بعملياتك"
                      className="w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--navy)] placeholder:text-[var(--text-secondary)]/70 focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20 outline-none transition"
                    />
                  </div>
                  <button type="submit" className="btn-primary w-full justify-center mt-2">
                    <Send size={17} />
                    إرسال الطلب
                  </button>
                  <p className="text-xs text-center text-[var(--text-secondary)]">
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
