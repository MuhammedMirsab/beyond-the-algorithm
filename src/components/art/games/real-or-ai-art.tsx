import type { ReactNode } from "react";

/**
 * The same scene twice: one photographed, one predicted pixel by pixel.
 * Hovering moves the magnifier, as if you were checking the details.
 */
const IW = 132;
const IH = 112;

/** How dark the scene is at a point inside the picture (0 to 1). */
function scene(x: number, y: number) {
  const sun = Math.hypot(x - 94, y - 30) < 15 ? 0.35 : 0;
  const farHill = y > 62 - Math.sin(x / 22) * 10 - (x / IW) * 18 ? 0.55 : 0;
  const nearHill = y > 84 - Math.cos(x / 30) * 8 ? 0.95 : 0;
  return Math.max(sun, farHill, nearHill, 0.06);
}

const DOTS = (() => {
  const out: { x: number; y: number; r: number }[] = [];
  for (let y = 4; y < IH; y += 6.4) {
    for (let x = 4; x < IW; x += 6.4) {
      const t = scene(x, y);
      if (t > 0.08) out.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round((0.6 + t * 2.6) * 100) / 100 });
    }
  }
  return out;
})();

function Photo() {
  return (
    <g>
      <rect width={IW} height={IH} rx={8} fill="currentColor" fillOpacity={0.06} />
      <circle cx={94} cy={30} r={15} fill="currentColor" fillOpacity={0.35} />
      <path d={`M0 ${IH - 50}C26 ${IH - 72} 52 ${IH - 60} 76 ${IH - 72}S118 ${IH - 78} ${IW} ${IH - 66}V${IH - 8}a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8z`} fill="currentColor" fillOpacity={0.55} />
      <path d={`M0 ${IH - 26}C34 ${IH - 38} 78 ${IH - 20} ${IW} ${IH - 34}V${IH - 8}a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8z`} fill="currentColor" fillOpacity={0.95} />
    </g>
  );
}

function Generated() {
  return (
    <g>
      <rect width={IW} height={IH} rx={8} fill="currentColor" fillOpacity={0.06} />
      {DOTS.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="currentColor" />
      ))}
    </g>
  );
}

function Frame({ x, rotate, label, children }: { x: number; rotate: number; label: string; children: ReactNode }) {
  return (
    <g transform={`translate(${x} 40) rotate(${rotate} 76 92)`}>
      <rect width={152} height={180} rx={16} fill="white" fillOpacity={0.96} />
      <g transform="translate(10 10)">{children}</g>
      <text x={76} y={158} textAnchor="middle" fontSize={20} fontWeight={800} fill="currentColor" style={{ fontFamily: "var(--font-mona)" }}>
        {label}
      </text>
    </g>
  );
}

export function RealOrAiArt() {
  return (
    <svg viewBox="50 24 386 218" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <Frame x={68} rotate={-4} label="A">
        <Photo />
      </Frame>
      <Frame x={258} rotate={4} label="B">
        <Generated />
      </Frame>

      <g className="art-move group-hover/tile:-translate-x-[150px] group-hover/tile:translate-y-[18px]">
        <g transform="translate(362 116)">
          <circle r={30} fill="white" fillOpacity={0.35} stroke="currentColor" strokeWidth={6} />
          <path d="M22 22l24 24" stroke="currentColor" strokeWidth={11} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
