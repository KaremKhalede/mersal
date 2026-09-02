import { LayoutDashboard, Package, Route, Truck, BarChart3, Bell, Search, ChevronDown } from "lucide-react";
import { useReveal } from "../../hooks/useReveal";
import Reveal from "../Reveal";

const sidebarItems = [
  { icon: LayoutDashboard, label: "لوحة التحكم", active: true },
  { icon: Package, label: "الشحنات" },
  { icon: Route, label: "الرحلات" },
  { icon: Truck, label: "السائقين" },
  { icon: BarChart3, label: "التقارير" },
];

const shipmentRows = [
  { id: "#SH-1042", client: "مصنع الشمال للتجارة", branch: "فرع الرياض", status: "قيد التوصيل", tone: "blue" },
  { id: "#SH-1041", client: "شركة الخليج للأغذية", branch: "فرع جدة", status: "تم التسليم", tone: "green" },
  { id: "#SH-1040", client: "مؤسسة الواحة التجارية", branch: "فرع الدمام", status: "قيد التجهيز", tone: "orange" },
];

const toneClasses: Record<string, string> = {
  blue: "bg-[var(--soft-blue)] text-[var(--blue)]",
  green: "bg-green-50 text-[var(--success)]",
  orange: "bg-orange-50 text-[var(--orange-deep)]",
};

export default function ProductShowcase() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="about" ref={ref} className="relative py-24 sm:py-28 bg-white overflow-hidden">
      <div className="container-px mx-auto max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div className="order-2 lg:order-1">
            <Reveal>
              <span className="pill-badge">لوحة التحكم</span>
            </Reveal>
            <Reveal index={1}>
              <h2 className="mt-5 text-3xl sm:text-4xl font-black text-[var(--navy)] leading-snug">
                من الصورة الكاملة إلى <span className="brand-gradient-text">أدق التفاصيل</span>
              </h2>
            </Reveal>
            <Reveal index={2}>
              <p className="mt-4 text-lg leading-8 text-[var(--text-secondary)] max-w-lg">
                يوفر مرسال رؤية واضحة لعملياتك اليومية، حتى تتمكن من معرفة ما يحدث واتخاذ القرار المناسب في الوقت المناسب.
              </p>
            </Reveal>

            <Reveal index={3} className="mt-8 grid grid-cols-2 gap-4 max-w-md">
              {[
                { label: "الشحنات", value: "لحظة بلحظة" },
                { label: "الرحلات", value: "مراحل واضحة" },
                { label: "الفروع", value: "إدارة موحدة" },
                { label: "التقارير", value: "قرارات أذكى" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-light)] p-4">
                  <p className="text-xs text-[var(--text-secondary)]">{s.label}</p>
                  <p className="mt-1 font-bold text-[var(--navy)] text-sm">{s.value}</p>
                </div>
              ))}
            </Reveal>
          </div>

          {/* dashboard mock */}
          <Reveal index={2} className="order-1 lg:order-2 relative">
            <div className="relative mx-auto max-w-xl">
              <div className="rounded-2xl border border-[var(--border)] bg-white shadow-[0_30px_70px_-25px_rgba(11,35,72,0.35)] overflow-hidden">
                <div className="flex">
                  {/* sidebar */}
                  <div className="hidden sm:flex w-16 flex-col items-center gap-4 bg-[var(--navy-deep)] py-5">
                    {sidebarItems.map((it, i) => (
                      <span
                        key={i}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                          it.active ? "bg-[var(--orange)] text-white" : "text-white/50"
                        }`}
                      >
                        <it.icon size={16} />
                      </span>
                    ))}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* topbar */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                      <p className="font-bold text-[var(--navy)] text-sm">لوحة التحكم — نظرة عامة</p>
                      <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                        <Search size={15} />
                        <Bell size={15} />
                        <span className="inline-flex h-6 w-6 rounded-full bg-[var(--soft-blue)]" />
                      </div>
                    </div>

                    {/* stat cards */}
                    <div className="grid grid-cols-3 gap-3 px-5 pt-5">
                      {[
                        { label: "شحنات نشطة", value: "128" },
                        { label: "رحلات اليوم", value: "34" },
                        { label: "نسبة التسليم", value: "98%" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl bg-[var(--bg-light)] border border-[var(--border)] p-3">
                          <p className="text-[0.65rem] text-[var(--text-secondary)]">{s.label}</p>
                          <p className="text-lg font-black text-[var(--navy)] mt-1">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* table */}
                    <div className="px-5 pt-5 pb-5">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-bold text-[var(--navy)]">أحدث الشحنات</p>
                        <span className="flex items-center gap-1 text-[0.65rem] text-[var(--text-secondary)]">
                          الكل <ChevronDown size={12} />
                        </span>
                      </div>
                      <div className="space-y-2">
                        {shipmentRows.map((r) => (
                          <div
                            key={r.id}
                            className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5"
                          >
                            <div>
                              <p className="text-xs font-bold text-[var(--navy)]">{r.client}</p>
                              <p className="text-[0.65rem] text-[var(--text-secondary)] mt-0.5">
                                {r.id} · {r.branch}
                              </p>
                            </div>
                            <span className={`text-[0.65rem] font-bold px-2.5 py-1 rounded-full ${toneClasses[r.tone]}`}>
                              {r.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* floating trip card */}
              <div className="animate-float absolute -bottom-8 -right-4 sm:-right-10 w-52 rounded-2xl bg-white border border-[var(--border)] shadow-[0_20px_45px_-15px_rgba(11,35,72,0.3)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[0.65rem] font-bold text-[var(--text-secondary)]">رحلة #T-908</span>
                  <span className="h-2 w-2 rounded-full bg-[var(--success)] pulse-dot" />
                </div>
                <p className="text-sm font-bold text-[var(--navy)] mt-1">الرياض ← جدة</p>
                <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-light)] overflow-hidden">
                  <div className="h-full w-3/4 rounded-full bg-gradient-to-l from-[var(--orange-deep)] to-[var(--orange)]" />
                </div>
              </div>

              {/* floating driver badge */}
              <div className="animate-float-slow absolute -top-6 -left-4 sm:-left-8 rounded-2xl bg-white border border-[var(--border)] shadow-[0_20px_45px_-15px_rgba(11,35,72,0.3)] px-4 py-3">
                <p className="text-[0.65rem] text-[var(--text-secondary)]">سائقون متاحون</p>
                <p className="text-xl font-black text-[var(--navy)]">16</p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
