import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "light" | "dark";
  showWordmark?: boolean;
  className?: string;
}

export default function Logo({ variant = "light", showWordmark = true, className }: LogoProps) {
  const isDark = variant === "dark";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        width="42"
        height="36"
        viewBox="0 0 64 54"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="mersal-box-top" x1="10" y1="10" x2="40" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FDCD82" />
            <stop offset="1" stopColor="#F2A23D" />
          </linearGradient>
          <linearGradient id="mersal-box-left" x1="10" y1="24" x2="27" y2="50" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F2851C" />
            <stop offset="1" stopColor="#DE6620" />
          </linearGradient>
          <linearGradient id="mersal-box-right" x1="27" y1="24" x2="44" y2="50" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E06A22" />
            <stop offset="1" stopColor="#C94A1E" />
          </linearGradient>
        </defs>

        {/* speed lines */}
        <rect x="0" y="15" width="10" height="3.4" rx="1.7" fill="#F2851C" opacity="0.9" />
        <rect x="0" y="24" width="15" height="3.4" rx="1.7" fill="#F2851C" opacity="0.7" />
        <rect x="0" y="33" width="10" height="3.4" rx="1.7" fill="#F2851C" opacity="0.5" />

        {/* isometric box */}
        <path d="M27 6 L44 15.5 L27 25 L10 15.5 Z" fill="url(#mersal-box-top)" />
        <path d="M10 15.5 L27 25 L27 44 L10 34.5 Z" fill="url(#mersal-box-left)" />
        <path d="M44 15.5 L27 25 L27 44 L44 34.5 Z" fill="url(#mersal-box-right)" />
        <path d="M27 25 L27 44" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
        <path d="M10 15.5 L27 6 L44 15.5" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" fill="none" />

        {/* wifi arcs */}
        <path d="M49 15c3.5-3.6 9-3.6 12.5 0" stroke="#F2851C" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <path d="M52 19.2c1.7-1.8 4.5-1.8 6.2 0" stroke="#F2851C" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.85" />
      </svg>

      {showWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-black tracking-tight text-[1.45rem]",
              isDark ? "text-white" : "text-[var(--navy)]"
            )}
          >
            مرسال
          </span>
          <span
            className={cn(
              "text-[0.6rem] font-medium tracking-[0.18em] uppercase mt-0.5",
              isDark ? "text-white/50" : "text-[var(--text-secondary)]"
            )}
          >
            Mersal Tech Solutions
          </span>
        </div>
      )}
    </div>
  );
}
