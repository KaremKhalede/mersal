"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, X, PhoneCall, LogIn } from "lucide-react";
import Logo from "./logo";
import { navLinks } from "@/data/landing-content";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const isHome = pathname === "/";

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
      window.location.href = "/" + href;
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
      <div className="chargee-container">
        <div
          className={`flex items-center justify-between rounded-2xl px-5 py-3 transition-all duration-300 ${
            scrolled
              ? "bg-white/85 backdrop-blur-lg shadow-[var(--shadow-card)] border border-[var(--chargee-border)]"
              : "bg-white/40 backdrop-blur-sm border border-transparent"
          }`}
        >
          <Link href="/" aria-label="مرسال — الصفحة الرئيسية" className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden lg:flex items-center gap-1" aria-label="التنقل الرئيسي">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className="px-4 py-2 text-sm font-semibold text-[var(--chargee-text)]/80 rounded-lg hover:text-[var(--chargee-orange)] hover:bg-[var(--chargee-bg)] transition-colors"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-2.5">
            <button onClick={() => handleNavClick("#contact")} className="chargee-primary-button !py-2 !px-5 text-sm !min-h-0 h-10">
              <PhoneCall size={16} />
              تواصل معنا
            </button>
            <Link href="/login" className="chargee-secondary-button !py-2 !px-5 text-sm !min-h-0 h-10">
              <LogIn size={16} />
              تسجيل الدخول
            </Link>
          </div>

          <button
            className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--chargee-navy)] hover:bg-[var(--chargee-bg)] transition-colors"
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
        <div className="chargee-container">
          <div className="rounded-2xl bg-white shadow-[var(--shadow-hover)] border border-[var(--chargee-border)] p-5 flex flex-col gap-1">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleNavClick(link.href)}
                className="text-right px-4 py-3 rounded-xl text-[var(--chargee-text)] font-semibold hover:bg-[var(--chargee-bg)] hover:text-[var(--chargee-orange)] transition-colors"
              >
                {link.label}
              </button>
            ))}
            <div className="h-px bg-[var(--chargee-border)] my-2" />
            <button
              onClick={() => handleNavClick("#contact")}
              className="chargee-primary-button w-full justify-center"
            >
              <PhoneCall size={16} />
              تواصل معنا
            </button>
            <Link href="/login" onClick={() => setOpen(false)} className="chargee-secondary-button w-full justify-center mt-2">
              <LogIn size={16} />
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
