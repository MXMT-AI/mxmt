import { useId } from "react";

interface Point { date: string; qty: number }

export default function SalesSparkline({
  data,
  color = "var(--cyan-ink)",
  height = 56,
  label,
  emptyMessage,
}: {
  data: Point[];
  color?: string;
  height?: number;
  label: string;
  emptyMessage: string;
}) {
  const id = useId();
  const gradientId = `sales-gradient-${id}`;
  const titleId = `sales-title-${id}`;

  if (data.length < 2) return (
    <div className="flex items-center justify-center text-xs text-(--subtle)" style={{ height }}>
      {emptyMessage}
    </div>
  );

  const W = 300;
  const H = height;
  const values = data.map((d) => d.qty);
  const max = Math.max(...values, 1);
  const PAD = 4;

  const toX = (i: number) => (i / (data.length - 1)) * W;
  const toY = (v: number) => H - PAD - ((v / max) * (H - PAD * 2));

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(d.qty).toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{label}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
