import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import Logo from "../components/Logo";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1200);
  };

  return (
    <div className="min-h-screen bg-[var(--navy-deep)] relative overflow-hidden flex flex-col">
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 10% 10%, #F2851C 0, transparent 35%), radial-gradient(circle at 90% 90%, #155EEF 0, transparent 40%)",
        }}
      />

      <header className="relative container-px mx-auto max-w-7xl w-full py-6 flex items-center justify-between">
        <Link to="/" aria-label="مرسال — العودة للرئيسية">
          <Logo variant="dark" />
        </Link>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/70 hover:text-white transition-colors"
        >
          <ArrowRight size={15} />
          العودة للرئيسية
        </Link>
      </header>

      <main className="relative flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-[1.75rem] bg-white shadow-[0_30px_80px_-25px_rgba(0,0,0,0.5)] p-8 sm:p-10">
            <span className="pill-badge">
              <ShieldCheck size={14} />
              بوابة الشركات المسجلة
            </span>
            <h1 className="mt-5 text-2xl sm:text-3xl font-black text-[var(--navy)]">تسجيل الدخول</h1>
            <p className="mt-2 text-[var(--text-secondary)] leading-7">
              خاص بموظفي الشركات المسجلة لدى مرسال. استخدم البيانات التي زودك بها مدير حسابك.
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-[var(--navy)] mb-1.5">البريد الإلكتروني</label>
                <div className="relative">
                  <Mail size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    className="w-full rounded-xl border border-[var(--border)] bg-white pr-11 pl-4 py-3 text-sm text-[var(--navy)] placeholder:text-[var(--text-secondary)]/70 focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-[var(--navy)]">كلمة المرور</label>
                  <button type="button" className="text-xs font-semibold text-[var(--orange-deep)] hover:underline">
                    نسيت كلمة المرور؟
                  </button>
                </div>
                <div className="relative">
                  <Lock size={17} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[var(--border)] bg-white pr-11 pl-11 py-3 text-sm text-[var(--navy)] placeholder:text-[var(--text-secondary)]/70 focus:border-[var(--orange)] focus:ring-2 focus:ring-[var(--orange)]/20 outline-none transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--navy)]"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" className="accent-[var(--orange)]" />
                تذكرني على هذا الجهاز
              </label>

              <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                {loading ? "جاري التحقق..." : "تسجيل الدخول"}
              </button>
            </form>

            <div className="mt-7 pt-6 border-t border-[var(--border)] text-center">
              <p className="text-sm text-[var(--text-secondary)]">شركتك غير مسجلة بعد في مرسال؟</p>
              <Link
                to="/register"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--orange-deep)] hover:underline"
              >
                <Building2 size={15} />
                أرسل طلب تسجيل شركتك
              </Link>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-white/40 leading-6">
            الوصول إلى مرسال متاح فقط للشركات المسجلة والمعتمدة من إدارة المنصة.
          </p>
        </div>
      </main>
    </div>
  );
}
