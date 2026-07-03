"use client";

interface Point { date: string; qty: number }

export default function SalesSparkline({
  data,
  color = "#00e5c4",
  height = 56,
}: {
  data: Point[];
  color?: string;
  height?: number;
}) {
  if (data.length < 2) return (
    <div className="h-14 flex items-center justify-center text-xs text-[var(--subtle)]">
      Недостатньо даних
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
  const gradId = `sg_${color.replace("#", "")}`;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
