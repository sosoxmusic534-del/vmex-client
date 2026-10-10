import { useMemo } from "react";

function path(data: number[], max: number, w: number, h: number) {
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - 4 - (v / max) * (h - 12)] as const);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

/** Smooth live area chart: download (filled) and upload (line). */
export default function SpeedChart({ down, up, height = 150 }: { down: number[]; up: number[]; height?: number }) {
  const w = 600;
  const max = Math.max(64 * 1024, ...down, ...up) * 1.15;
  const dPath = useMemo(() => path(down, max, w, height), [down, max, height]);
  const uPath = useMemo(() => path(up, max, w, height), [up, max, height]);

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img" aria-label="Live speed">
      <defs>
        <linearGradient id="chart-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={height * f} y2={height * f} className="chart-grid" />
      ))}
      <path d={`${dPath} L${w},${height} L0,${height} Z`} fill="url(#chart-down)" />
      <path d={dPath} className="chart-down" />
      <path d={uPath} className="chart-up" />
    </svg>
  );
}
