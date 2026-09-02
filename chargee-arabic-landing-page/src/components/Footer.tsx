import { Link, useLocation, useNavigate } from "react-router-dom";
import { PhoneCall, Mail, MapPin } from "lucide-react";
import Logo from "./Logo";
import { navLinks } from "../data/content";

export default function Footer() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";

  const handleNavClick = (href: string) => {
    if (!isHome) {
      navigate("/" + href);
      return;
    }
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <footer className="relative bg-[var(--navy-deep)] text-white overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 20%, #fff 0, transparent 40%), radial-gradient(circle at 85% 80%, #F2851C 0, transparent 45%)",
        }}
      />
      <div className="relative container-px mx-auto max-w-7xl py-16">
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-10">
          <div>
            <Logo variant="dark" />
            <p className="mt-4 text-sm leading-7 text-white/60 max-w-xs">
              نظام متكامل لإدارة الشحن والنقل — يمنح شركات الشحن واللوجستيات رؤية واضحة وتحكمًا كاملاً في عملياتها اليومية.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-white mb-4">روابط سريعة</h3>
            <ul className="space-y-3 text-sm text-white/60">
              {navLinks.slice(0, 4).map((l) => (
                <li key={l.href}>
                  <button onClick={() => handleNavClick(l.href)} className="hover:text-[var(--orange-light)] transition-colors">
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-white mb-4">حسابك</h3>
            <ul className="space-y-3 text-sm text-white/60">
              <li>
                <button onClick={() => handleNavClick("#faq")} className="hover:text-[var(--orange-light)] transition-colors">
                  الأسئلة الشائعة
                </button>
              </li>
              <li>
                <Link to="/login" className="hover:text-[var(--orange-light)] transition-colors">
                  تسجيل الدخول
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-[var(--orange-light)] transition-colors">
                  تسجيل شركة جديدة
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-bold text-white mb-4">تواصل معنا</h3>
            <ul className="space-y-3 text-sm text-white/60">
              <li className="flex items-center gap-2.5">
                <PhoneCall size={16} className="text-[var(--orange-light)]" />
                <span dir="ltr">920 000 000</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail size={16} className="text-[var(--orange-light)]" />
                <span>contact@mersal.sa</span>
              </li>
              <li className="flex items-center gap-2.5">
                <MapPin size={16} className="text-[var(--orange-light)]" />
                <span>الرياض، المملكة العربية السعودية</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/45">
          <p>© 2026 مرسال (Mersal). جميع الحقوق محفوظة.</p>
          <p>Mersal Tech Solutions</p>
        </div>
      </div>
    </footer>
  );
}
