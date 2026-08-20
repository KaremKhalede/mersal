"use client";

import { useMemo, useRef, useState } from "react";

type Point = { key: string; label: string; count: number };

const WIDTH = 640;
const HEIGHT = 220;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 28;

function niceMax(value: number): number {
  if (value <= 0) return 10;
  const step = value <= 20 ? 5 : value <= 100 ? 20 : Math.pow(10, Math.floor(Math.log10(value)) - 1) * 5;
  return Math.ceil(value / step) * step;
}

/** Line + area trend, drawn to a fixed viewBox and scaled by the SVG itself (no resize observer
 * needed) — a crosshair follows the pointer and snaps to the nearest day, per the dataviz
 * skill's interaction spec: "the crosshair finds the X." */
export function ActivityChart({ data }: { data: Point[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.count), 0)), [data]);
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const xAt = (i: number) => PAD_LEFT + stepX * i;
  const yAt = (v: number) => PAD_TOP + innerH * (1 - v / max);

  const linePath = data.map((d, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(d.count)}`).join(" ");
  const areaPath = `${linePath} L ${xAt(data.length - 1)} ${PAD_TOP + innerH} L ${xAt(0)} ${PAD_TOP + innerH} Z`;

  const gridSteps = 4;
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || data.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const i = Math.round((x - PAD_LEFT) / (stepX || 1));
    setHoverIndex(Math.min(data.length - 1, Math.max(0, i)));
  }

  const hovered = hoverIndex != null ? data[hoverIndex] : null;
  const tooltipLeft = hoverIndex != null ? (xAt(hoverIndex) / WIDTH) * 100 : 0;
  const flipTooltip = tooltipLeft > 70;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full touch-none"
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {Array.from({ length: gridSteps + 1 }, (_, i) => {
          const v = (max / gridSteps) * i;
          const y = yAt(v);
          return (
            <g key={i}>
              <line x1={PAD_LEFT} y1={y} x2={WIDTH - PAD_RIGHT} y2={y} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.key} x={xAt(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
              {d.label}
            </text>
          ) : null
        )}

        <path d={areaPath} fill="var(--primary)" opacity={0.1} />
        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {hoverIndex != null && (
          <line x1={xAt(hoverIndex)} y1={PAD_TOP} x2={xAt(hoverIndex)} y2={PAD_TOP + innerH} stroke="var(--primary)" strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
        )}
        {data.map((d, i) => (
          <circle
            key={d.key}
            cx={xAt(i)}
            cy={yAt(d.count)}
            r={hoverIndex === i ? 5 : 4}
            fill="var(--primary)"
            stroke="var(--card)"
            strokeWidth={2}
            className="transition-[r] duration-100"
          />
        ))}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-y-full rounded-lg border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
          style={{ [flipTooltip ? "right" : "left"]: `${flipTooltip ? 100 - tooltipLeft : tooltipLeft}%`, top: 4 }}
        >
          <p className="font-semibold">{hovered.count.toLocaleString()} شحنة</p>
          <p className="text-muted-foreground">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}
