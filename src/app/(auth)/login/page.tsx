import { LoginForm } from "./login-form";
import Logo from "@/components/landing/logo";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex flex-col lg:grid lg:grid-cols-2 bg-[#f8fafc] text-right" dir="rtl">
      
      {/* ═══════════ RIGHT COLUMN — Hero Marketing (First in DOM -> Right in RTL) ═══════════ */}
      <div className="relative hidden lg:flex flex-col bg-[var(--navy-deep)] overflow-hidden h-screen">
        
        {/* Background Truck Image with Dark Overlay */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.pexels.com/photos/16706765/pexels-photo-16706765.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=1200"
            alt="Truck background"
            className="absolute inset-0 w-full h-full object-cover object-center opacity-40 mix-blend-overlay grayscale-[0.2]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--navy-deep)] via-[var(--navy-deep)]/80 to-[var(--navy-deep)]/60 z-10" />
        </div>

        {/* Content Wrapper */}
        <div className="relative z-20 flex flex-col h-full p-12">
          
          {/* Logo - Top Right */}
          <div className="absolute top-12 right-12">
            <Logo variant="dark" className="scale-110 origin-top-right" />
          </div>

          {/* Right-aligned Text Content */}
          <div className="flex-1 flex flex-col justify-center items-start text-right mt-10 px-8 xl:px-16">
            <div className="mb-5">
              <span className="text-[var(--orange-light)] text-[15px] font-bold tracking-wide">
                بوابة المنشآت المسجلة
              </span>
            </div>
            
            <h1 className="text-4xl xl:text-[46px] font-black text-white leading-[1.4] mb-6 drop-shadow-lg">
              عمليات الشحن<br />
              من شاشة واحدة
            </h1>
            
            <p className="text-gray-300 text-[16px] leading-relaxed max-w-md font-medium">
              سجل الدخول لإدارة الشحنات والرحلات والفروع والموظفين داخل حساب شركتك.
            </p>
          </div>
          
        </div>
      </div>

      {/* ═══════════ LEFT COLUMN — Login Form (Second in DOM -> Left in RTL) ═══════════ */}
      <div className="relative flex flex-col justify-center items-center p-8 min-h-screen">
        
        {/* Top Left "Back to home" */}
        <div className="absolute top-8 left-8 z-20">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-[var(--navy)] hover:text-[var(--orange)] transition-colors">
            <span className="text-[14px]">العودة للرئيسية</span>
          </Link>
        </div>

        <div className="w-full max-w-[480px] flex flex-col justify-center items-center z-10">
          <div className="w-full">
            {/* Card */}
            <div className="bg-white rounded-[2rem] p-10 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-gray-100">
              
              {/* Header (Right aligned) */}
              <div className="flex flex-col items-start text-right mb-8">
                <h2 className="text-[28px] font-black text-[var(--navy)] mb-3">تسجيل الدخول</h2>
                <p className="text-[13px] text-gray-500 font-medium">
                  للموظفين والحسابات التابعة لشركة مسجلة في مرسال.
                </p>
              </div>

              {/* Form */}
              <LoginForm />

              {/* Links below button */}
              <div className="mt-8 space-y-3 text-center">
                <p className="text-[13px] font-medium text-gray-400">
                  شركتك غير مسجلة؟{" "}
                  <Link href="/register" className="text-[var(--orange-deep)] font-bold hover:underline">
                    اطلب تسجيل المنشأة
                  </Link>
                </p>
                <p className="text-[13px] font-medium text-gray-400">
                  وصلت هنا وتريد تتبّع شحنة فقط؟{" "}
                  <Link href="/track" className="text-[var(--navy)] font-bold hover:underline">
                    تتبّع شحنة
                  </Link>
                </p>
                <p className="text-[13px] font-medium text-gray-400">
                  تحتاج مساعدة؟{" "}
                  <Link href="/#contact" className="text-[var(--navy)] font-bold hover:underline">
                    تواصل معنا
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
