/**
 * Minimal SVG area/line chart for the carton-usage panel: a filled series for the selected month
 * and a dashed comparison line for the previous one. Same reasoning as DonutChart — hand-rolled
 * paths instead of a charting dependency, server-rendered, no client JS.
 *
 * Drawn in a fixed viewBox and stretched with preserveAspectRatio="none" so it fills any container
 * width; stroke-widths are compensated via vector-effect so lines stay 1–2px at any scale.
 */
export type SeriesPoint = { day: number; current: number; previous: number };

const W = 600;
const H = 200;
const PAD_TOP = 8;
const PAD_BOTTOM = 4;

function buildPath(values: number[], max: number, close: boolean) {
  if (values.length === 0) return "";
  const stepX = values.length === 1 ? 0 : W / (values.length - 1);
  const y = (v: number) => {
    const usable = H - PAD_TOP - PAD_BOTTOM;
    return H - PAD_BOTTOM - (max === 0 ? 0 : (v / max) * usable);
  };
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${y(v).toFixed(2)}`).join(" ");
  return close ? `${line} L ${W} ${H} L 0 ${H} Z` : line;
}

export function AreaChart({ series, labelCurrent, labelPrevious }: { series: SeriesPoint[]; labelCurrent: string; labelPrevious: string }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.current, p.previous)));
  const current = series.map((p) => p.current);
  const previous = series.map((p) => p.previous);

  // Gridline values, top-down.
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(max * f));

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-4 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {labelCurrent}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground/60" />
          {labelPrevious}
        </span>
      </div>

      <div className="flex gap-2" dir="ltr">
        <div className="flex flex-col justify-between py-1 text-2xs tabular-nums text-muted-foreground">
          {ticks.map((t, i) => (
            <span key={i}>{t >= 1000 ? `${Math.round(t / 1000)}K` : t}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-44 w-full overflow-visible"
            role="img"
            aria-label={`${labelCurrent} مقابل ${labelPrevious}`}
          >
            <defs>
              <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line
                key={f}
                x1="0"
                x2={W}
                y1={PAD_TOP + f * (H - PAD_TOP - PAD_BOTTOM)}
                y2={PAD_TOP + f * (H - PAD_TOP - PAD_BOTTOM)}
                stroke="currentColor"
                className="text-border"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={buildPath(current, max, true)} fill="url(#areaFill)" />
            <path
              d={buildPath(previous, max, false)}
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground/50"
              strokeWidth="2"
              strokeDasharray="5 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={buildPath(current, max, false)}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="mt-1 flex justify-between text-2xs tabular-nums text-muted-foreground">
            {[1, 6, 11, 16, 21, 26, series.length].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
