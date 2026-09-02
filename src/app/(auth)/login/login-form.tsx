"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="mt-8 space-y-5" dir="rtl">
      
      {/* Email */}
      <div>
        <label htmlFor="email" className="block text-[13px] font-bold text-[var(--navy)] mb-2">البريد الإلكتروني</label>
        <div className="relative">
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="name@company.com"
            className="w-full h-[46px] rounded-xl border border-gray-200 bg-white px-4 text-sm text-[var(--navy)] placeholder:text-gray-400 focus:border-[var(--navy)] focus:ring-1 focus:ring-[var(--navy)] outline-none transition-all shadow-sm"
            dir="ltr"
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-[13px] font-bold text-[var(--navy)] mb-2">كلمة المرور</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            placeholder="••••••••"
            className="w-full h-[46px] rounded-xl border border-gray-200 bg-white pr-10 pl-4 py-3 text-sm text-[var(--navy)] placeholder:text-gray-400 focus:border-[var(--navy)] focus:ring-1 focus:ring-[var(--navy)] outline-none transition-all shadow-sm tracking-widest font-mono"
            dir="ltr"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[var(--navy)] transition-colors"
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Remember me */}
      <div className="flex items-center justify-start">
        <label htmlFor="remember" className="flex items-center gap-2 text-[13px] font-medium text-gray-500 cursor-pointer select-none">
          <input id="remember" type="checkbox" className="accent-[var(--navy)] h-4 w-4 rounded border-gray-300" />
          تذكرني
        </label>
      </div>

      {/* Error Message */}
      {state.error && (
        <p className="text-sm text-red-500 font-medium text-center py-1">{state.error}</p>
      )}

      {/* Submit Button */}
      <button 
        type="submit" 
        className="w-full justify-center bg-[var(--navy-deep)] hover:bg-[#061229] text-white font-bold h-[48px] rounded-xl transition-all shadow-lg active:scale-[0.98] mt-4" 
        disabled={pending}
      >
        {pending ? "جاري التحقق..." : "تسجيل الدخول"}
      </button>
    </form>
  );
}
