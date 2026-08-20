const TONE_STROKE: Record<string, string> = {
  success: "var(--success)",
  primary: "var(--primary)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
  muted: "var(--muted-foreground)",
};

const TONE_DOT: Record<string, string> = {
  success: "bg-success",
  primary: "bg-primary",
  warning: "bg-warning",
  destructive: "bg-destructive",
  muted: "bg-muted-foreground",
};

/** CSS-only ring wouldn't give per-slice hover, so this draws the donut as stacked SVG arcs
 * (stroke-dasharray trick) — each <circle> is a real hoverable mark, no client JS needed since
 * the "lift on hover" is a plain CSS transition on stroke-width. */
export function StatusDonut({ total, segments }: { total: number; segments: { key: string; label: string; count: number; tone: string }[] }) {
  const r = 72;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-center">
      <div className="relative shrink-0">
        <svg width={200} height={200} viewBox="0 0 200 200" className="-rotate-90">
          <circle cx={100} cy={100} r={r} fill="none" stroke="var(--muted)" strokeWidth={26} />
          {total > 0 &&
            segments
              .filter((s) => s.count > 0)
              .map((s) => {
                const segLen = (s.count / total) * circumference;
                const dashoffset = circumference - cumulative;
                cumulative += segLen;
                return (
                  <circle
                    key={s.key}
                    cx={100}
                    cy={100}
                    r={r}
                    fill="none"
                    stroke={TONE_STROKE[s.tone]}
                    strokeWidth={26}
                    strokeDasharray={`${segLen} ${circumference - segLen}`}
                    strokeDashoffset={dashoffset}
                    className="transition-[stroke-width] duration-150 hover:stroke-[32px]"
                  >
                    <title>{`${s.label}: ${s.count.toLocaleString()} (${Math.round((s.count / total) * 100)}%)`}</title>
                  </circle>
                );
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-3xl font-bold">{total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">إجمالي الشحنات</p>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1 sm:w-auto">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-6 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[s.tone]}`} />
              {s.label}
            </span>
            <span className="font-medium">
              {s.count.toLocaleString()} <span className="text-muted-foreground">({total > 0 ? Math.round((s.count / total) * 100) : 0}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
