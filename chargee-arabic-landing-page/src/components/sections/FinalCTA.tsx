import { PhoneCall, LogIn } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";

const IMG =
  "https://images.pexels.com/photos/35097902/pexels-photo-35097902.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=800&w=1600";

export default function FinalCTA() {
  const ref = useReveal<HTMLDivElement>();
  const scrollTo = (href: string) => document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });

  return (
    <section ref={ref} className="relative py-24 sm:py-28 overflow-hidden">
      <div className="container-px mx-auto max-w-7xl">
        <Reveal>
          <div className="relative rounded-[2rem] overflow-hidden">
            <img src={IMG} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-l from-[var(--navy-deep)]/97 via-[var(--navy-deep)]/92 to-[var(--navy)]/85" />
            <svg className="absolute inset-x-0 bottom-10 w-full h-16 opacity-30" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
              <path d="M-50 40 C 300 10, 700 70, 1100 20 S 1500 40, 1600 10" stroke="#F2851C" strokeWidth="2" className="route-dash" fill="none" />
            </svg>

            <div className="relative px-6 py-16 sm:px-14 sm:py-20 text-center flex flex-col items-center">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-snug max-w-2xl">
                جاهز لتنظيم عمليات الشحن <span className="text-[var(--orange-light)]">بشكل أفضل؟</span>
              </h2>
              <p className="mt-5 text-white/65 text-lg max-w-xl leading-8">
                اجعل إدارة الشحن أكثر وضوحًا، وتنظيمًا، وسلاسة مع مرسال.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
                <button onClick={() => scrollTo("#contact")} className="btn-primary text-base">
                  <PhoneCall size={18} />
                  تواصل معنا
                </button>
                <a href="/login" className="btn-ghost-dark text-base">
                  <LogIn size={18} />
                  تسجيل الدخول
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
