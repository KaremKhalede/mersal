import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, X, PhoneCall, LogIn } from "lucide-react";
import Logo from "./Logo";
import { navLinks } from "../data/content";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleNavClick = (href: string) => {
    setOpen(false);
    if (!isHome) {
      navigate("/" + href);
      return;
    }
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "py-2" : "py-4"
      }`}
    >
      <div className="container-px mx-auto max-w-7xl">
        <div
          className={`flex items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300 ${
            scrolled
              ? "bg-white/85 backdrop-blur-lg shadow-[0_8px_30px_-12px_rgba(11,35,72,0.18)] border border-white/60"
              : "bg-white/40 backdrop-blur-sm border border-transparent"
          }`}
        >
          <Link to="/" aria-label="مرسال — الصفحة الرئيسية" className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden lg:flex items-center gap-1" aria-label="التنقل الرئيسي">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className="px-4 py-2 text-sm font-semibold text-[var(--navy)]/80 rounded-lg hover:text-[var(--orange-deep)] hover:bg-orange-50/70 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2.5">
            <button onClick={() => handleNavClick("#contact")} className="btn-primary !py-2.5 !px-5 text-sm">
              <PhoneCall size={16} />
              تواصل معنا
            </button>
            <Link to="/login" className="btn-secondary !py-2.5 !px-5 text-sm">
              <LogIn size={16} />
              تسجيل الدخول
            </Link>
          </div>

          <button
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--navy)] hover:bg-orange-50 transition-colors"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={open}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden fixed inset-x-0 top-0 z-40 transition-all duration-300 ease-out ${
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-3 pointer-events-none"
        }`}
        style={{ paddingTop: "5.2rem" }}
      >
        <div className="container-px mx-auto max-w-7xl">
          <div className="rounded-2xl bg-white shadow-[0_20px_60px_-15px_rgba(11,35,72,0.35)] border border-[var(--border)] p-5 flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className="text-right px-4 py-3 rounded-xl text-[var(--navy)] font-semibold hover:bg-orange-50 hover:text-[var(--orange-deep)] transition-colors"
              >
                {link.label}
              </button>
            ))}
            <div className="h-px bg-[var(--border)] my-2" />
            <button
              onClick={() => handleNavClick("#contact")}
              className="btn-primary w-full justify-center"
            >
              <PhoneCall size={16} />
              تواصل معنا
            </button>
            <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary w-full justify-center">
              <LogIn size={16} />
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
