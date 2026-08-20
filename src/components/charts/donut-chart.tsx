/**
 * Minimal SVG donut. Built by hand rather than pulling in a charting library: the dashboard needs
 * exactly two shapes, and a dependency would cost far more bytes than the arc maths below.
 * Rendered server-side with no client JS.
 */
export type DonutSlice = { label: string; value: number; color: string };

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const p = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function DonutChart({
  slices,
  total,
  caption,
  size = 180,
  thickness = 22,
}: {
  slices: DonutSlice[];
  total: number;
  caption: string;
  size?: number;
  thickness?: number;
}) {
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // A single 360° arc collapses to a point (start === end), so a lone non-zero slice is drawn as a
  // full circle instead.
  const only = slices.filter((s) => s.value > 0);
  let cursor = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${caption}: ${total}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={thickness} className="text-muted" />
        {sum > 0 && only.length === 1 ? (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={only[0].color} strokeWidth={thickness} />
        ) : (
          sum > 0 &&
          slices.map((s) => {
            if (s.value <= 0) return null;
            const sweep = (s.value / sum) * 360;
            const from = cursor;
            cursor += sweep;
            // 1.5° gap keeps adjacent segments visually separated.
            return (
              <path
                key={s.label}
                d={arc(cx, cy, r, from, Math.max(from, cursor - 1.5))}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeLinecap="butt"
              />
            );
          })
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tabular-nums">{total.toLocaleString("en-US")}</span>
        <span className="text-[11px] text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}
